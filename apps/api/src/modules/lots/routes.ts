import type { FastifyInstance } from "fastify";
import { asc, desc, eq } from "drizzle-orm";
import {
  evidenceFiles,
  inspections,
  lots,
  orders,
  reweighRequests,
  users,
  type Database,
} from "@alpacto/database";
import {
  createInspectionSchema,
  createLotSchema,
  reweighRequestSchema,
} from "@alpacto/shared-schemas";
import type { AuthUser } from "../../plugins/auth.js";
import { ApiError } from "../../lib/errors.js";

function serializeLot(row: typeof lots.$inferSelect) {
  return {
    id: row.id,
    onchainLotId: row.onchainLotId?.toString() ?? null,
    orderId: row.orderId,
    producerId: row.producerId,
    status: row.status,
    currentInspectionVersion: row.currentInspectionVersion,
    acceptedInspectionVersion: row.acceptedInspectionVersion,
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
        status: "registered",
      })
      .returning();
    if (!row) throw new ApiError(500, "Failed to create lot");
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

    return {
      lot: serializeLot(lot),
      inspections: inspectionRows.map(serializeInspection),
      reweighRequests: reweighRows.map((r) => ({
        id: r.id,
        reasonCode: r.reasonCode,
        reasonText: r.reasonText,
        createdAt: r.createdAt.toISOString(),
      })),
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

    const nextVersion = lot.currentInspectionVersion + 1;
    if (lot.status === "reweighing_requested" && nextVersion <= lot.currentInspectionVersion) {
      throw new ApiError(400, "Invalid inspection version");
    }

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

    return {
      id: row!.id,
      lotId,
      reasonCode: body.reasonCode,
      status: "reweighing_requested",
    };
  });
}
