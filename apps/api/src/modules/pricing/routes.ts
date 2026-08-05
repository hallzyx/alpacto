import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { pricingCategories, pricingPolicies, type Database } from "@alpacto/database";
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
    categories: categories.map((c) => ({
      code: c.code,
      label: c.label,
      pricePenMinorPerKg: c.pricePenMinorPerKg.toString(),
      qualityBonusPenMinorPerKg: c.qualityBonusPenMinorPerKg.toString(),
    })),
  };
}

export async function registerPricingRoutes(
  app: FastifyInstance,
  db: Database,
  authenticate: (req: unknown, reply: unknown) => Promise<void>,
) {
  app.get("/pricing-policies", { preHandler: authenticate }, async () => {
    const policies = await db.select().from(pricingPolicies);
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
}
