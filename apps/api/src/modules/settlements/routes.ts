import type { FastifyInstance } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import {
  auditRuns,
  campaigns,
  inspections,
  lots,
  orders,
  pricingCategories,
  pricingPolicies,
  settlements,
  type Database,
} from "@alpacto/database";
import { calculateSettlementPreview, isSettlementAllowed } from "@alpacto/domain";
import type { AuthUser } from "../../plugins/auth.js";
import { ApiError } from "../../lib/errors.js";
import { createHash } from "node:crypto";

async function loadSettlementContext(db: Database, lotId: string) {
  const [lot] = await db.select().from(lots).where(eq(lots.id, lotId)).limit(1);
  if (!lot) throw new ApiError(404, "Lot not found");
  if (lot.currentInspectionVersion < 1) {
    throw new ApiError(400, "Lot has no inspection");
  }

  const [inspection] = await db
    .select()
    .from(inspections)
    .where(
      and(eq(inspections.lotId, lotId), eq(inspections.version, lot.currentInspectionVersion)),
    )
    .limit(1);
  if (!inspection) throw new ApiError(404, "Inspection not found");

  const [order] = await db.select().from(orders).where(eq(orders.id, lot.orderId)).limit(1);
  if (!order) throw new ApiError(404, "Order not found");

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, order.campaignId))
    .limit(1);
  if (!campaign) throw new ApiError(404, "Campaign not found");

  const [policy] = await db
    .select()
    .from(pricingPolicies)
    .where(eq(pricingPolicies.id, campaign.pricingPolicyId))
    .limit(1);
  if (!policy) throw new ApiError(404, "Pricing policy not found");

  const [category] = await db
    .select()
    .from(pricingCategories)
    .where(
      and(
        eq(pricingCategories.pricingPolicyId, policy.id),
        eq(pricingCategories.code, inspection.categoryCode),
      ),
    )
    .limit(1);
  if (!category) throw new ApiError(404, "Category not found");

  return { lot, inspection, policy, category };
}

function serializeSettlement(row: typeof settlements.$inferSelect) {
  return {
    id: row.id,
    lotId: row.lotId,
    inspectionVersion: row.inspectionVersion,
    weightGrams: row.weightGrams.toString(),
    categoryCode: row.categoryCode,
    grossPenMinor: row.grossPenMinor.toString(),
    bonusPenMinor: row.bonusPenMinor.toString(),
    feePenMinor: row.feePenMinor.toString(),
    netPenMinor: row.netPenMinor.toString(),
    producerUsdcUnits: row.producerUsdcUnits.toString(),
    associationUsdcUnits: row.associationUsdcUnits.toString(),
    quoteHash: row.quoteHash,
    status: row.status,
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    settledAt: row.settledAt?.toISOString() ?? null,
    settlementTxHash: row.settlementTxHash,
  };
}

export async function registerSettlementRoutes(
  app: FastifyInstance,
  db: Database,
  authenticate: (req: unknown, reply: unknown) => Promise<void>,
) {
  app.get("/lots/:id/settlement-preview", { preHandler: authenticate }, async (request) => {
    const { id: lotId } = request.params as { id: string };
    const { inspection, policy, category } = await loadSettlementContext(db, lotId);

    const penPerUsdcMicros =
      policy.penPerUsdcMicros > 0n ? policy.penPerUsdcMicros : 3_750_000n;
    const preview = calculateSettlementPreview({
      weightGrams: inspection.weightGrams,
      pricePenMinorPerKg: category.pricePenMinorPerKg,
      qualityBonusPenMinorPerKg: category.qualityBonusPenMinorPerKg,
      associationFeeBps: policy.associationFeeBps,
      penPerUsdcMicros,
    });

    return {
      lotId,
      inspectionVersion: inspection.version,
      weightGrams: inspection.weightGrams.toString(),
      categoryCode: inspection.categoryCode,
      grossPenMinor: preview.grossPenMinor.toString(),
      bonusPenMinor: preview.bonusPenMinor.toString(),
      feePenMinor: preview.feePenMinor.toString(),
      netPenMinor: preview.netPenMinor.toString(),
      producerUsdcUnits: preview.producerUsdcUnits.toString(),
      associationUsdcUnits: preview.associationUsdcUnits.toString(),
    };
  });

  app.post("/lots/:id/settlement/accept", { preHandler: authenticate }, async (request) => {
    const user = request.user as AuthUser;
    if (!["buyer", "admin"].includes(user.role)) {
      throw new ApiError(403, "Forbidden");
    }
    const { id: lotId } = request.params as { id: string };

    const [latestAudit] = await db
      .select()
      .from(auditRuns)
      .where(eq(auditRuns.lotId, lotId))
      .orderBy(desc(auditRuns.inspectionVersion))
      .limit(1);

    if (!latestAudit || !isSettlementAllowed(latestAudit.resultCode)) {
      throw new ApiError(
        409,
        "Settlement blocked — audit requires review or is incomplete",
        "AUDIT_BLOCKED",
      );
    }

    const { lot, inspection, policy, category } = await loadSettlementContext(db, lotId);
    const penPerUsdcMicros =
      policy.penPerUsdcMicros > 0n ? policy.penPerUsdcMicros : 3_750_000n;
    const preview = calculateSettlementPreview({
      weightGrams: inspection.weightGrams,
      pricePenMinorPerKg: category.pricePenMinorPerKg,
      qualityBonusPenMinorPerKg: category.qualityBonusPenMinorPerKg,
      associationFeeBps: policy.associationFeeBps,
      penPerUsdcMicros,
    });

    const quoteHash = `0x${createHash("sha256")
      .update(
        JSON.stringify({
          lotId,
          version: inspection.version,
          netPenMinor: preview.netPenMinor.toString(),
        }),
      )
      .digest("hex")}`;

    const [row] = await db
      .insert(settlements)
      .values({
        lotId,
        inspectionVersion: inspection.version,
        weightGrams: inspection.weightGrams,
        categoryCode: inspection.categoryCode,
        grossPenMinor: preview.grossPenMinor,
        bonusPenMinor: preview.bonusPenMinor,
        feePenMinor: preview.feePenMinor,
        netPenMinor: preview.netPenMinor,
        producerUsdcUnits: preview.producerUsdcUnits,
        associationUsdcUnits: preview.associationUsdcUnits,
        quoteHash,
        status: "accepted",
        acceptedAt: new Date(),
      })
      .returning();

    await db
      .update(lots)
      .set({
        acceptedInspectionVersion: inspection.version,
        status: "settlement_accepted",
        updatedAt: new Date(),
      })
      .where(eq(lots.id, lot.id));

    return serializeSettlement(row!);
  });

  app.get("/lots/:id/settlement", { preHandler: authenticate }, async (request) => {
    const { id: lotId } = request.params as { id: string };
    const [row] = await db
      .select()
      .from(settlements)
      .where(eq(settlements.lotId, lotId))
      .orderBy(desc(settlements.acceptedAt))
      .limit(1);
    if (!row) throw new ApiError(404, "Settlement not found");
    return serializeSettlement(row);
  });
}
