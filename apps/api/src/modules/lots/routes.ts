import type { FastifyInstance } from "fastify";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  auditRuns,
  campaigns,
  evidenceFiles,
  fundingIntents,
  inspections,
  lotDisputes,
  lots,
  orders,
  pricingCategories,
  reweighRequests,
  settlements,
  users,
  type Database,
} from "@alpacto/database";
import {
  createInspectionSchema,
  createLotSchema,
  declineLotSchema,
  reweighRequestSchema,
} from "@alpacto/shared-schemas";
import type { AuthUser } from "../../plugins/auth.js";
import { ApiError } from "../../lib/errors.js";
import { isChainConfigured } from "../../lib/onchain-ids.js";
import { ensureLotRegisteredOnchain } from "../../lib/register-lot-onchain.js";
import { ensureReweighOnchain, ProducerSessionRequiredError } from "../../lib/request-reweigh-onchain.js";
import { ensureInspectionReferenceOnchain } from "../../lib/submit-inspection-onchain.js";
import { z } from "zod";

function serializeLot(row: typeof lots.$inferSelect) {
  return {
    id: row.id,
    onchainLotId: row.onchainLotId?.toString() ?? null,
    orderId: row.orderId,
    producerId: row.producerId,
    status: row.status,
    currentInspectionVersion: row.currentInspectionVersion,
    acceptedInspectionVersion: row.acceptedInspectionVersion,
    producerConfirmedAt: row.producerConfirmedAt?.toISOString() ?? null,
    producerDeclinedAt: row.producerDeclinedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeInspection(row: typeof inspections.$inferSelect) {
  return {
    id: row.id,
    lotId: row.lotId,
    version: row.version,
    inspectorId: row.inspectorId,
    weightGrams: row.weightGrams.toString(),
    categoryCode: row.categoryCode,
    evidenceBundleHash: row.evidenceBundleHash,
    status: row.status,
    submittedAt: row.submittedAt.toISOString(),
    onchainTxHash: row.onchainTxHash,
  };
}

export async function registerLotRoutes(
  app: FastifyInstance,
  db: Database,
  authenticate: (req: unknown, reply: unknown) => Promise<void>,
) {
  app.get("/lots", { preHandler: authenticate }, async (request) => {
    const user = request.user as AuthUser;
    const query = z
      .object({
        producerId: z.string().uuid().optional(),
        orderId: z.string().uuid().optional(),
        status: z.string().optional(),
      })
      .parse(request.query ?? {});

    const conditions = [];
    if (user.role === "producer") {
      conditions.push(eq(lots.producerId, user.id));
    } else if (query.producerId) {
      conditions.push(eq(lots.producerId, query.producerId));
    }
    if (query.orderId) conditions.push(eq(lots.orderId, query.orderId));
    if (query.status) conditions.push(eq(lots.status, query.status));

    const rows =
      conditions.length > 0
        ? await db
            .select()
            .from(lots)
            .where(and(...conditions))
            .orderBy(desc(lots.updatedAt))
        : await db.select().from(lots).orderBy(desc(lots.updatedAt));

    return { lots: rows.map(serializeLot) };
  });

  app.post("/lots", { preHandler: authenticate }, async (request) => {
    const user = request.user as AuthUser;
    if (!["association", "inspector", "admin"].includes(user.role)) {
      throw new ApiError(403, "Forbidden");
    }
    const body = createLotSchema.parse(request.body);
    const [order] = await db.select().from(orders).where(eq(orders.id, body.orderId)).limit(1);
    if (!order) throw new ApiError(404, "Order not found");
    if (!["funded", "accepting_lots", "partially_settled"].includes(order.status)) {
      throw new ApiError(400, "Order not accepting lots", "INVALID_ORDER_STATUS");
    }
    const [producer] = await db.select().from(users).where(eq(users.id, body.producerId)).limit(1);
    if (!producer) throw new ApiError(404, "Producer not found");

    const [row] = await db
      .insert(lots)
      .values({
        orderId: body.orderId,
        producerId: body.producerId,
        onchainLotId: body.onchainLotId,
        status: "awaiting_producer_confirmation",
      })
      .returning();
    if (!row) throw new ApiError(500, "Failed to create lot");

    // Funded on-chain orders must register the lot on AlpactoCore immediately so
    // Ayni can submitAuditAttestation after inspection (not only at settle time).
    if (order.onchainOrderId && isChainConfigured()) {
      try {
        await ensureLotRegisteredOnchain(db, row.id);
      } catch (err) {
        await db.delete(lots).where(eq(lots.id, row.id));
        const msg = err instanceof Error ? err.message : "Failed to register lot on-chain";
        throw new ApiError(502, msg, "ONCHAIN_REGISTER_LOT_FAILED");
      }
      const [updated] = await db.select().from(lots).where(eq(lots.id, row.id)).limit(1);
      return serializeLot(updated ?? row);
    }

    return serializeLot(row);
  });

  app.get("/lots/:id", { preHandler: authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    const [row] = await db.select().from(lots).where(eq(lots.id, id)).limit(1);
    if (!row) throw new ApiError(404, "Lot not found");
    return serializeLot(row);
  });

  app.get("/lots/:id/timeline", { preHandler: authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    const [lot] = await db.select().from(lots).where(eq(lots.id, id)).limit(1);
    if (!lot) throw new ApiError(404, "Lot not found");

    const inspectionRows = await db
      .select()
      .from(inspections)
      .where(eq(inspections.lotId, id))
      .orderBy(asc(inspections.version));

    const reweighRows = await db
      .select()
      .from(reweighRequests)
      .where(eq(reweighRequests.lotId, id))
      .orderBy(desc(reweighRequests.createdAt));

    const auditRows = await db
      .select()
      .from(auditRuns)
      .where(eq(auditRuns.lotId, id))
      .orderBy(desc(auditRuns.inspectionVersion));

    const settlementRows = await db
      .select()
      .from(settlements)
      .where(eq(settlements.lotId, id));

    const [order] = await db.select().from(orders).where(eq(orders.id, lot.orderId)).limit(1);
    const fundingRows = order
      ? await db.select().from(fundingIntents).where(eq(fundingIntents.orderId, order.id))
      : [];

    const events: Array<{
      type: string;
      at: string;
      label: string;
      meta?: Record<string, string | null>;
    }> = [];

    events.push({
      type: "lot_registered",
      at: lot.createdAt.toISOString(),
      label: "Lote registrado por la asociación",
    });
    if (lot.producerConfirmedAt) {
      events.push({
        type: "producer_confirmed",
        at: lot.producerConfirmedAt.toISOString(),
        label: "Productor confirmó: es mi fibra",
      });
    }
    if (lot.producerDeclinedAt) {
      events.push({
        type: "producer_declined",
        at: lot.producerDeclinedAt.toISOString(),
        label: "Productor declinó el lote (disputa)",
      });
    }

    for (const insp of inspectionRows) {
      events.push({
        type: "inspection",
        at: insp.submittedAt.toISOString(),
        label: `Inspección v${insp.version} — ${insp.weightGrams.toString()} g · ${insp.categoryCode}`,
        meta: { version: String(insp.version), status: insp.status },
      });
    }
    for (const r of reweighRows) {
      events.push({
        type: "reweigh_request",
        at: r.createdAt.toISOString(),
        label: `Solicitud de nuevo pesaje — ${r.reasonCode}`,
      });
    }
    for (const a of auditRows) {
      events.push({
        type: "audit",
        at: (a.completedAt ?? a.startedAt ?? lot.updatedAt).toISOString(),
        label: `Ayni: ${a.resultCode ?? a.status}`,
        meta: { resultCode: a.resultCode, status: a.status },
      });
    }
    for (const f of fundingRows) {
      events.push({
        type: "funding",
        at: f.createdAt.toISOString(),
        label: `Fondeo ${f.status}`,
        meta: { status: f.status },
      });
    }
    for (const s of settlementRows) {
      events.push({
        type: "settlement",
        at: (s.acceptedAt ?? s.settledAt ?? lot.updatedAt).toISOString(),
        label: `Liquidación ${s.status}`,
        meta: { status: s.status, netPenMinor: s.netPenMinor.toString() },
      });
    }

    events.sort((a, b) => a.at.localeCompare(b.at));

    return {
      lot: serializeLot(lot),
      inspections: inspectionRows.map(serializeInspection),
      reweighRequests: reweighRows.map((r) => ({
        id: r.id,
        reasonCode: r.reasonCode,
        reasonText: r.reasonText,
        createdAt: r.createdAt.toISOString(),
      })),
      audits: auditRows.map((a) => ({
        id: a.id,
        status: a.status,
        resultCode: a.resultCode,
        inspectionVersion: a.inspectionVersion,
        completedAt: a.completedAt?.toISOString() ?? null,
      })),
      events,
    };
  });

  app.post("/lots/:id/inspections", { preHandler: authenticate }, async (request) => {
    const user = request.user as AuthUser;
    if (!["inspector", "admin"].includes(user.role)) {
      throw new ApiError(403, "Forbidden");
    }
    const { id: lotId } = request.params as { id: string };
    const body = createInspectionSchema.parse(request.body);

    const [lot] = await db.select().from(lots).where(eq(lots.id, lotId)).limit(1);
    if (!lot) throw new ApiError(404, "Lot not found");
    if (["awaiting_producer_confirmation", "producer_declined", "cancelled"].includes(lot.status)) {
      throw new ApiError(
        400,
        "Lot must be confirmed by the producer before inspection",
        "LOT_NOT_CONFIRMED",
      );
    }

    const [order] = await db.select().from(orders).where(eq(orders.id, lot.orderId)).limit(1);
    if (!order) throw new ApiError(404, "Order not found");
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, order.campaignId))
      .limit(1);
    if (!campaign) throw new ApiError(404, "Campaign not found");
    const [pricedCategory] = await db
      .select()
      .from(pricingCategories)
      .where(
        and(
          eq(pricingCategories.pricingPolicyId, campaign.pricingPolicyId),
          eq(pricingCategories.code, body.categoryCode),
        ),
      )
      .limit(1);
    if (!pricedCategory) {
      throw new ApiError(
        400,
        `Category ${body.categoryCode} is not priced in this campaign's policy`,
        "INVALID_CATEGORY",
      );
    }

    const nextVersion = lot.currentInspectionVersion + 1;
    if (lot.status === "reweighing_requested" && nextVersion <= lot.currentInspectionVersion) {
      throw new ApiError(400, "Invalid inspection version");
    }

    const previousVersion = lot.currentInspectionVersion;
    const previousStatus = lot.status;

    let row;
    try {
      [row] = await db
        .insert(inspections)
        .values({
          lotId,
          version: nextVersion,
          inspectorId: user.id,
          weightGrams: body.weightGrams,
          categoryCode: body.categoryCode,
          evidenceBundleHash: body.evidenceBundleHash,
          status: "submitted",
        })
        .returning();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "";
      if (message.includes("inspections_lot_version")) {
        throw new ApiError(409, "Inspection version already exists", "VERSION_CONFLICT");
      }
      throw err;
    }

    if (body.evidenceFileIds?.length) {
      for (const fileId of body.evidenceFileIds) {
        await db
          .update(evidenceFiles)
          .set({ inspectionId: row!.id })
          .where(eq(evidenceFiles.id, fileId));
      }
    }

    await db
      .update(lots)
      .set({
        currentInspectionVersion: nextVersion,
        status: "inspection_submitted",
        updatedAt: new Date(),
      })
      .where(eq(lots.id, lotId));

    // On-chain orders: push inspection reference now so lot → AUDITING and Ayni can attest.
    if (order.onchainOrderId && isChainConfigured()) {
      try {
        await ensureInspectionReferenceOnchain(db, row!.id);
      } catch (err) {
        await db
          .update(evidenceFiles)
          .set({ inspectionId: null })
          .where(eq(evidenceFiles.inspectionId, row!.id));
        await db.delete(inspections).where(eq(inspections.id, row!.id));
        await db
          .update(lots)
          .set({
            currentInspectionVersion: previousVersion,
            status: previousStatus,
            updatedAt: new Date(),
          })
          .where(eq(lots.id, lotId));
        const msg = err instanceof Error ? err.message : "Failed to submit inspection on-chain";
        throw new ApiError(502, msg, "ONCHAIN_INSPECTION_FAILED");
      }
      const [updated] = await db.select().from(inspections).where(eq(inspections.id, row!.id)).limit(1);
      return serializeInspection(updated ?? row!);
    }

    return serializeInspection(row!);
  });

  app.get("/lots/:id/inspections", { preHandler: authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    const rows = await db
      .select()
      .from(inspections)
      .where(eq(inspections.lotId, id))
      .orderBy(asc(inspections.version));
    return { inspections: rows.map(serializeInspection) };
  });

  app.post("/lots/:id/reweigh-request", { preHandler: authenticate }, async (request) => {
    const user = request.user as AuthUser;
    const { id: lotId } = request.params as { id: string };
    const body = reweighRequestSchema.parse(request.body);

    const [lot] = await db.select().from(lots).where(eq(lots.id, lotId)).limit(1);
    if (!lot) throw new ApiError(404, "Lot not found");
    if (user.role !== "admin" && user.id !== lot.producerId) {
      throw new ApiError(403, "Only the lot producer may request reweighing");
    }
    if (["settled", "settlement_accepted"].includes(lot.status)) {
      throw new ApiError(400, "Cannot request reweighing on a settled lot");
    }
    if (lot.status === "reweighing_requested") {
      throw new ApiError(400, "Reweighing already requested");
    }
    if (lot.currentInspectionVersion < 1) {
      throw new ApiError(400, "Lot has no inspection to dispute");
    }

    const [order] = await db.select().from(orders).where(eq(orders.id, lot.orderId)).limit(1);
    const onchainLot = Boolean(order?.onchainOrderId && isChainConfigured() && lot.onchainLotId);
    if (onchainLot && !["ready_for_review", "review_required"].includes(lot.status)) {
      throw new ApiError(
        400,
        "Puedes pedir un nuevo pesaje cuando Ayni termine su revisión (lote listo para liquidar o con revisión requerida)",
        "REWEIGH_TOO_EARLY",
      );
    }

    const previousStatus = lot.status;

    const [row] = await db
      .insert(reweighRequests)
      .values({
        lotId,
        requestedBy: user.id,
        reasonCode: body.reasonCode,
        reasonText: body.reasonText,
      })
      .returning();

    await db
      .update(lots)
      .set({ status: "reweighing_requested", updatedAt: new Date() })
      .where(eq(lots.id, lotId));

    if (onchainLot) {
      try {
        await ensureReweighOnchain(db, row!.id);
      } catch (err) {
        await db.delete(reweighRequests).where(eq(reweighRequests.id, row!.id));
        await db
          .update(lots)
          .set({ status: previousStatus, updatedAt: new Date() })
          .where(eq(lots.id, lotId));
        if (err instanceof ProducerSessionRequiredError) {
          throw new ApiError(409, err.message, err.code);
        }
        const raw = err instanceof Error ? err.message : "Failed to request reweigh on-chain";
        const msg = /UserOperation reverted/i.test(raw)
          ? "No se pudo confirmar el nuevo pesaje on-chain. Si Ayni ya terminó su revisión, vuelve a intentarlo en unos segundos."
          : /eip7702Auth|zd_sponsorUserOperation|Validation error|HTTP request failed|viem@/i.test(raw)
            ? "No se pudo confirmar el nuevo pesaje ahora. Espera unos segundos e inténtalo de nuevo."
            : raw.slice(0, 280);
        throw new ApiError(502, msg, "ONCHAIN_REWEIGH_FAILED");
      }
    }

    const [updated] = await db
      .select()
      .from(reweighRequests)
      .where(eq(reweighRequests.id, row!.id))
      .limit(1);

    return {
      id: row!.id,
      lotId,
      reasonCode: body.reasonCode,
      status: "reweighing_requested",
      onchainTxHash: updated?.onchainTxHash ?? null,
    };
  });

  app.post("/lots/:id/confirm", { preHandler: authenticate }, async (request) => {
    const user = request.user as AuthUser;
    const { id: lotId } = request.params as { id: string };

    const [lot] = await db.select().from(lots).where(eq(lots.id, lotId)).limit(1);
    if (!lot) throw new ApiError(404, "Lot not found");
    if (user.role !== "admin" && user.id !== lot.producerId) {
      throw new ApiError(403, "Only the lot producer may confirm");
    }
    if (lot.status !== "awaiting_producer_confirmation") {
      throw new ApiError(400, "Lot is not awaiting confirmation");
    }

    const [row] = await db
      .update(lots)
      .set({
        status: "registered",
        producerConfirmedAt: new Date(),
        producerDeclinedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(lots.id, lotId))
      .returning();
    if (!row) throw new ApiError(500, "Failed to confirm lot");
    return serializeLot(row);
  });

  app.post("/lots/:id/decline", { preHandler: authenticate }, async (request) => {
    const user = request.user as AuthUser;
    const { id: lotId } = request.params as { id: string };
    const body = declineLotSchema.parse(request.body ?? {});

    const [lot] = await db.select().from(lots).where(eq(lots.id, lotId)).limit(1);
    if (!lot) throw new ApiError(404, "Lot not found");
    if (user.role !== "admin" && user.id !== lot.producerId) {
      throw new ApiError(403, "Only the lot producer may decline");
    }
    if (lot.status !== "awaiting_producer_confirmation") {
      throw new ApiError(400, "Lot is not awaiting confirmation");
    }

    const [dispute] = await db
      .insert(lotDisputes)
      .values({
        lotId,
        openedBy: user.id,
        reasonCode: body.reasonCode,
        reasonText: body.reasonText,
        status: "open",
      })
      .returning();
    if (!dispute) throw new ApiError(500, "Failed to open dispute");

    const [row] = await db
      .update(lots)
      .set({
        status: "producer_declined",
        producerDeclinedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(lots.id, lotId))
      .returning();
    if (!row) throw new ApiError(500, "Failed to decline lot");

    return {
      lot: serializeLot(row),
      dispute: {
        id: dispute.id,
        lotId: dispute.lotId,
        reasonCode: dispute.reasonCode,
        reasonText: dispute.reasonText,
        status: dispute.status,
        createdAt: dispute.createdAt.toISOString(),
      },
    };
  });
}
