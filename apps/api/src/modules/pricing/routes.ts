import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import { desc, eq, or, isNull } from "drizzle-orm";
import { pricingCategories, pricingPolicies, type Database } from "@alpacto/database";
import { createPricingPolicySchema } from "@alpacto/shared-schemas";
import type { AuthUser } from "../../plugins/auth.js";
import { ApiError } from "../../lib/errors.js";

function serializePolicy(
  policy: typeof pricingPolicies.$inferSelect,
  categories: (typeof pricingCategories.$inferSelect)[],
) {
  return {
    id: policy.id,
    version: policy.version,
    currency: policy.currency,
    associationFeeBps: policy.associationFeeBps,
    platformFeeBps: policy.platformFeeBps,
    weightToleranceBps: policy.weightToleranceBps,
    penPerUsdcMicros: policy.penPerUsdcMicros.toString(),
    policyHash: policy.policyHash,
    createdBy: policy.createdBy,
    lockedAt: policy.lockedAt?.toISOString() ?? null,
    createdAt: policy.createdAt.toISOString(),
    categories: categories.map((c) => ({
      code: c.code,
      label: c.label,
      pricePenMinorPerKg: c.pricePenMinorPerKg.toString(),
      qualityBonusPenMinorPerKg: c.qualityBonusPenMinorPerKg.toString(),
    })),
  };
}

function penToMinor(pen: number): bigint {
  return BigInt(Math.round(pen * 100));
}

function computePolicyHash(input: {
  version: number;
  currency: string;
  associationFeeBps: number;
  platformFeeBps: number;
  weightToleranceBps: number;
  penPerUsdcMicros: bigint;
  categories: Array<{
    code: string;
    label: string;
    pricePenMinorPerKg: bigint;
    qualityBonusPenMinorPerKg: bigint;
  }>;
}): string {
  const payload = JSON.stringify({
    version: input.version,
    currency: input.currency,
    associationFeeBps: input.associationFeeBps,
    platformFeeBps: input.platformFeeBps,
    weightToleranceBps: input.weightToleranceBps,
    penPerUsdcMicros: input.penPerUsdcMicros.toString(),
    categories: input.categories
      .map((c) => ({
        code: c.code.toUpperCase(),
        label: c.label,
        price: c.pricePenMinorPerKg.toString(),
        bonus: c.qualityBonusPenMinorPerKg.toString(),
      }))
      .sort((a, b) => a.code.localeCompare(b.code)),
  });
  return `0x${createHash("sha256").update(payload).digest("hex")}`;
}

export async function registerPricingRoutes(
  app: FastifyInstance,
  db: Database,
  authenticate: (req: unknown, reply: unknown) => Promise<void>,
) {
  app.get("/pricing-policies", { preHandler: authenticate }, async (request) => {
    const user = request.user as AuthUser;
    const query = (request.query ?? {}) as { mine?: string };
    const mineOnly = query.mine === "1" || query.mine === "true";

    let policies: (typeof pricingPolicies.$inferSelect)[];
    if (mineOnly && user.role === "buyer") {
      policies = await db
        .select()
        .from(pricingPolicies)
        .where(or(eq(pricingPolicies.createdBy, user.id), isNull(pricingPolicies.createdBy)))
        .orderBy(desc(pricingPolicies.version));
    } else if (mineOnly && user.role === "admin") {
      policies = await db.select().from(pricingPolicies).orderBy(desc(pricingPolicies.version));
    } else {
      policies = await db.select().from(pricingPolicies).orderBy(desc(pricingPolicies.version));
    }

    const allCategories = await db.select().from(pricingCategories);
    const byPolicy = new Map<string, typeof allCategories>();
    for (const cat of allCategories) {
      const list = byPolicy.get(cat.pricingPolicyId) ?? [];
      list.push(cat);
      byPolicy.set(cat.pricingPolicyId, list);
    }
    return {
      policies: policies.map((p) => serializePolicy(p, byPolicy.get(p.id) ?? [])),
    };
  });

  app.get("/pricing-policies/:id", { preHandler: authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    const [policy] = await db
      .select()
      .from(pricingPolicies)
      .where(eq(pricingPolicies.id, id))
      .limit(1);
    if (!policy) throw new ApiError(404, "Pricing policy not found");

    const categories = await db
      .select()
      .from(pricingCategories)
      .where(eq(pricingCategories.pricingPolicyId, id));

    return serializePolicy(policy, categories);
  });

  app.post("/pricing-policies", { preHandler: authenticate }, async (request) => {
    const user = request.user as AuthUser;
    if (!["buyer", "admin"].includes(user.role)) {
      throw new ApiError(403, "Only buyers (or admin) may create pricing policies");
    }

    const body = createPricingPolicySchema.parse(request.body);

    const associationFeeBps =
      body.associationFeeBps ?? Math.round((body.associationFeePercent ?? 0) * 100);
    const weightToleranceBps =
      body.weightToleranceBps ?? Math.round((body.weightTolerancePercent ?? 1) * 100);
    const platformFeeBps =
      user.role === "admin" && body.platformFeeBps != null ? body.platformFeeBps : 50;

    const codes = new Set(body.categories.map((c) => c.code.toUpperCase()));
    if (codes.size !== body.categories.length) {
      throw new ApiError(400, "Duplicate category codes", "DUPLICATE_CATEGORY");
    }

    const [latest] = await db
      .select()
      .from(pricingPolicies)
      .orderBy(desc(pricingPolicies.version))
      .limit(1);
    const nextVersion = (latest?.version ?? 0) + 1;

    const penPerUsdcMicros = BigInt(Math.round(body.penPerUsdc * 1_000_000));
    const categoryRows = body.categories.map((c) => ({
      code: c.code.toUpperCase(),
      label: c.label,
      pricePenMinorPerKg: penToMinor(c.pricePenPerKg),
      qualityBonusPenMinorPerKg: penToMinor(c.qualityBonusPenPerKg),
    }));

    const policyHash = computePolicyHash({
      version: nextVersion,
      currency: body.currency,
      associationFeeBps,
      platformFeeBps,
      weightToleranceBps,
      penPerUsdcMicros,
      categories: categoryRows,
    });

    const [policy] = await db
      .insert(pricingPolicies)
      .values({
        version: nextVersion,
        currency: body.currency,
        associationFeeBps,
        platformFeeBps,
        weightToleranceBps,
        penPerUsdcMicros,
        policyHash,
        createdBy: user.role === "buyer" ? user.id : user.id,
      })
      .returning();
    if (!policy) throw new ApiError(500, "Failed to create pricing policy");

    const insertedCats = await db
      .insert(pricingCategories)
      .values(
        categoryRows.map((c) => ({
          pricingPolicyId: policy.id,
          code: c.code,
          label: c.label,
          pricePenMinorPerKg: c.pricePenMinorPerKg,
          qualityBonusPenMinorPerKg: c.qualityBonusPenMinorPerKg,
        })),
      )
      .returning();

    return serializePolicy(policy, insertedCats);
  });
}
