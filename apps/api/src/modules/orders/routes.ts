import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import {
  campaigns,
  orders,
  organizations,
  pricingCategories,
  pricingPolicies,
  type Database,
} from "@alpacto/database";
import { createOrderSchema } from "@alpacto/shared-schemas";
import {
  assertWithinDemoMaxUsdc,
  estimateOrderFundingFromKg,
  usdCentsToUsdcUnits,
} from "@alpacto/domain";
import type { AuthUser } from "../../plugins/auth.js";
import { ApiError } from "../../lib/errors.js";
import { config } from "../../config.js";

function serializeOrder(row: typeof orders.$inferSelect) {
  return {
    id: row.id,
    externalRef: row.externalRef,
    onchainOrderId: row.onchainOrderId?.toString() ?? null,
    campaignId: row.campaignId,
    buyerId: row.buyerId,
    associationId: row.associationId,
    budgetUsdCents: row.budgetUsdCents.toString(),
    targetWeightGrams: row.targetWeightGrams?.toString() ?? null,
    fundedUsdcUnits: row.fundedUsdcUnits.toString(),
    remainingUsdcUnits: row.remainingUsdcUnits.toString(),
    status: row.status,
    txHash: row.txHash,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function budgetFromTargetKg(
  db: Database,
  campaign: typeof campaigns.$inferSelect,
  targetWeightGrams: bigint,
) {
  const [policy] = await db
    .select()
    .from(pricingPolicies)
    .where(eq(pricingPolicies.id, campaign.pricingPolicyId))
    .limit(1);
  if (!policy) throw new ApiError(400, "Campaign pricing policy not found");

  const cats = await db
    .select()
    .from(pricingCategories)
    .where(eq(pricingCategories.pricingPolicyId, policy.id));
  const fine =
    cats.find((c) => c.code.toUpperCase() === "FINE") ?? cats[0] ?? null;
  if (!fine) throw new ApiError(400, "Pricing policy has no categories");

  const penPerUsdcMicros =
    policy.penPerUsdcMicros > 0n ? policy.penPerUsdcMicros : 3_750_000n;

  const estimate = estimateOrderFundingFromKg({
    weightGrams: targetWeightGrams,
    categoryCode: fine.code,
    pricePenMinorPerKg: fine.pricePenMinorPerKg,
    qualityBonusPenMinorPerKg: fine.qualityBonusPenMinorPerKg,
    associationFeeBps: policy.associationFeeBps,
    platformFeeBps: policy.platformFeeBps,
    penPerUsdcMicros,
  });

  assertWithinDemoMaxUsdc(
    usdCentsToUsdcUnits(estimate.budgetUsdCents),
    config.demo.maxFundingUsdc,
  );

  return estimate;
}

export async function registerOrderRoutes(
  app: FastifyInstance,
  db: Database,
  authenticate: (req: unknown, reply: unknown) => Promise<void>,
) {
  app.post("/orders", { preHandler: authenticate }, async (request) => {
    const user = request.user as AuthUser;
    if (!["buyer", "admin"].includes(user.role)) {
      throw new ApiError(403, "Forbidden");
    }
    const body = createOrderSchema.parse(request.body);
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, body.campaignId))
      .limit(1);
    if (!campaign) throw new ApiError(404, "Campaign not found");

    const associationId = body.associationId ?? campaign.organizationId;
    const [association] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, associationId))
      .limit(1);
    if (!association) throw new ApiError(404, "Association not found");

    let budgetUsdCents = body.budgetUsdCents;
    let targetWeightGrams = body.targetWeightGrams ?? null;

    if (body.targetWeightGrams != null) {
      const estimate = await budgetFromTargetKg(db, campaign, body.targetWeightGrams);
      budgetUsdCents = estimate.budgetUsdCents;
      targetWeightGrams = body.targetWeightGrams;
    } else if (budgetUsdCents != null) {
      assertWithinDemoMaxUsdc(
        usdCentsToUsdcUnits(budgetUsdCents),
        config.demo.maxFundingUsdc,
      );
    }

    if (budgetUsdCents == null || budgetUsdCents <= 0n) {
      throw new ApiError(400, "Invalid budget");
    }

    const [row] = await db
      .insert(orders)
      .values({
        campaignId: body.campaignId,
        buyerId: user.role === "admin" ? campaign.buyerId : user.id,
        associationId,
        externalRef: body.externalRef,
        budgetUsdCents,
        targetWeightGrams,
        fundedUsdcUnits: 0n,
        remainingUsdcUnits: 0n,
        status: "draft",
      })
      .returning();
    if (!row) throw new ApiError(500, "Failed to create order");
    return serializeOrder(row);
  });

  app.get("/orders", { preHandler: authenticate }, async (request) => {
    const user = request.user as AuthUser;
    if (user.role === "buyer") {
      const rows = await db.select().from(orders).where(eq(orders.buyerId, user.id));
      return { orders: rows.map(serializeOrder) };
    }
    if (user.role === "admin" || user.role === "association" || user.role === "inspector") {
      const rows = await db.select().from(orders);
      return { orders: rows.map(serializeOrder) };
    }
    throw new ApiError(403, "Forbidden");
  });

  app.get("/orders/:id", { preHandler: authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    const [row] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!row) throw new ApiError(404, "Order not found");
    return serializeOrder(row);
  });
}
