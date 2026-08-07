import type { FastifyInstance } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import {
  auditRuns,
  campaigns,
  inspections,
  localPayouts,
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
import { executeSettlementOnchain } from "../../lib/settlement-onchain.js";
import { isChainConfigured } from "../../lib/onchain-ids.js";
import { ProducerSessionRequiredError } from "../../lib/producer-signer.js";

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
    platformFeePenMinor: row.platformFeePenMinor.toString(),
    netPenMinor: row.netPenMinor.toString(),
    producerUsdcUnits: row.producerUsdcUnits.toString(),
    associationUsdcUnits: row.associationUsdcUnits.toString(),
    platformUsdcUnits: row.platformUsdcUnits.toString(),
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
      platformFeeBps: policy.platformFeeBps,
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
      platformFeePenMinor: preview.platformFeePenMinor.toString(),
      netPenMinor: preview.netPenMinor.toString(),
      producerUsdcUnits: preview.producerUsdcUnits.toString(),
      associationUsdcUnits: preview.associationUsdcUnits.toString(),
      platformUsdcUnits: preview.platformUsdcUnits.toString(),
    };
  });

  app.post("/lots/:id/settlement/accept", { preHandler: authenticate }, async (request) => {
    const user = request.user as AuthUser;
    if (!["buyer", "admin", "producer"].includes(user.role)) {
      throw new ApiError(403, "Forbidden");
    }
    const { id: lotId } = request.params as { id: string };

    const [lotCheck] = await db.select().from(lots).where(eq(lots.id, lotId)).limit(1);
    if (!lotCheck) throw new ApiError(404, "Lot not found");
    if (user.role === "producer" && lotCheck.producerId !== user.id) {
      throw new ApiError(403, "Only the lot producer may accept settlement");
    }

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
      platformFeeBps: policy.platformFeeBps,
      penPerUsdcMicros,
    });

    const quoteHash = `0x${createHash("sha256")
      .update(
        JSON.stringify({
          lotId,
          version: inspection.version,
          netPenMinor: preview.netPenMinor.toString(),
          platformUsdcUnits: preview.platformUsdcUnits.toString(),
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
        platformFeePenMinor: preview.platformFeePenMinor,
        netPenMinor: preview.netPenMinor,
        producerUsdcUnits: preview.producerUsdcUnits,
        associationUsdcUnits: preview.associationUsdcUnits,
        platformUsdcUnits: preview.platformUsdcUnits,
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

    let _settlementTxHash: string | null = null;
    if (isChainConfigured()) {
      try {
        _settlementTxHash = await executeSettlementOnchain(db, lotId, (msg) => {
          request.log.info({ lotId, msg }, "settlement-onchain");
        });
      } catch (err) {
        request.log.error({ err, lotId }, "on-chain settlement failed after accept");
        if (err instanceof ProducerSessionRequiredError) {
          throw new ApiError(409, err.message, err.code);
        }
        throw new ApiError(
          502,
          err instanceof Error ? err.message : "On-chain settlement failed",
          "SETTLEMENT_ONCHAIN_FAILED",
        );
      }
    }

    const [finalRow] = await db
      .select()
      .from(settlements)
      .where(eq(settlements.id, row!.id))
      .limit(1);

    return serializeSettlement(finalRow ?? row!);
  });

  app.post("/lots/:id/settlement/settle-onchain", { preHandler: authenticate }, async (request) => {
    const user = request.user as AuthUser;
    if (!["producer", "admin", "association"].includes(user.role)) {
      throw new ApiError(403, "Forbidden");
    }
    const { id: lotId } = request.params as { id: string };

    const [lotCheck] = await db.select().from(lots).where(eq(lots.id, lotId)).limit(1);
    if (!lotCheck) throw new ApiError(404, "Lot not found");
    if (user.role === "producer" && lotCheck.producerId !== user.id) {
      throw new ApiError(403, "Only the lot producer may settle on-chain");
    }

    if (!isChainConfigured()) {
      throw new ApiError(400, "On-chain settlement is not configured");
    }

    try {
      const txHash = await executeSettlementOnchain(db, lotId, (msg) => {
        request.log.info({ lotId, msg }, "settlement-onchain");
      });
      const [row] = await db
        .select()
        .from(settlements)
        .where(eq(settlements.lotId, lotId))
        .orderBy(desc(settlements.acceptedAt))
        .limit(1);
      if (!row) throw new ApiError(404, "Settlement not found");
      return { ...serializeSettlement(row), settlementTxHash: txHash };
    } catch (err) {
      if (err instanceof ProducerSessionRequiredError) {
        throw new ApiError(409, err.message, err.code);
      }
      throw new ApiError(
        502,
        err instanceof Error ? err.message : "On-chain settlement failed",
        "SETTLEMENT_ONCHAIN_FAILED",
      );
    }
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

  app.post("/lots/:id/local-payout/simulate", { preHandler: authenticate }, async (request) => {
    if (process.env["DEMO_LOCAL_PAYOUT_ENABLED"] === "false") {
      throw new ApiError(400, "Local payout simulation disabled");
    }
    const user = request.user as AuthUser;
    if (!["association", "admin", "producer", "buyer"].includes(user.role)) {
      throw new ApiError(403, "Forbidden");
    }
    const { id: lotId } = request.params as { id: string };
    const [settlement] = await db
      .select()
      .from(settlements)
      .where(eq(settlements.lotId, lotId))
      .orderBy(desc(settlements.acceptedAt))
      .limit(1);
    if (!settlement) throw new ApiError(404, "Settlement not found — accept first");

    const [existing] = await db
      .select()
      .from(localPayouts)
      .where(eq(localPayouts.settlementId, settlement.id))
      .limit(1);
    if (existing) {
      return {
        id: existing.id,
        settlementId: existing.settlementId,
        provider: existing.provider,
        isSimulation: existing.isSimulation,
        amountPenMinor: existing.amountPenMinor.toString(),
        status: existing.status,
        reference: existing.reference,
        createdAt: existing.createdAt.toISOString(),
        label: "Simulación de pago local en soles (no es transferencia real)",
      };
    }

    const [row] = await db
      .insert(localPayouts)
      .values({
        settlementId: settlement.id,
        provider: "demo_local",
        isSimulation: true,
        amountPenMinor: settlement.netPenMinor,
        status: "simulated_paid",
        reference: `SIM-PEN-${Date.now()}`,
      })
      .returning();

    await db
      .update(lots)
      .set({ status: "settled", updatedAt: new Date() })
      .where(eq(lots.id, lotId));

    await db
      .update(settlements)
      .set({ status: "settled", settledAt: new Date() })
      .where(eq(settlements.id, settlement.id));

    return {
      id: row!.id,
      settlementId: row!.settlementId,
      provider: row!.provider,
      isSimulation: row!.isSimulation,
      amountPenMinor: row!.amountPenMinor.toString(),
      status: row!.status,
      reference: row!.reference,
      createdAt: row!.createdAt.toISOString(),
      label: "Simulación de pago local en soles (no es transferencia real)",
    };
  });

  app.get("/lots/:id/local-payout", { preHandler: authenticate }, async (request) => {
    const { id: lotId } = request.params as { id: string };
    const [settlement] = await db
      .select()
      .from(settlements)
      .where(eq(settlements.lotId, lotId))
      .orderBy(desc(settlements.acceptedAt))
      .limit(1);
    if (!settlement) throw new ApiError(404, "Settlement not found");
    const [payout] = await db
      .select()
      .from(localPayouts)
      .where(eq(localPayouts.settlementId, settlement.id))
      .limit(1);
    if (!payout) throw new ApiError(404, "Local payout not found");
    return {
      id: payout.id,
      settlementId: payout.settlementId,
      provider: payout.provider,
      isSimulation: payout.isSimulation,
      amountPenMinor: payout.amountPenMinor.toString(),
      status: payout.status,
      reference: payout.reference,
      createdAt: payout.createdAt.toISOString(),
      label: "Simulación de pago local en soles (no es transferencia real)",
    };
  });
}
