import type { FastifyInstance } from "fastify";
import { desc, eq } from "drizzle-orm";
import {
  lotDisputes,
  lots,
  orders,
  users,
  type Database,
} from "@alpacto/database";
import { resolveLotDisputeSchema } from "@alpacto/shared-schemas";
import type { AuthUser } from "../../plugins/auth.js";
import { ApiError } from "../../lib/errors.js";
import { z } from "zod";

function serializeDispute(
  row: typeof lotDisputes.$inferSelect,
  extras?: {
    lotStatus?: string;
    orderId?: string;
    orderExternalRef?: string | null;
    producerName?: string | null;
    producerEmail?: string | null;
  },
) {
  return {
    id: row.id,
    lotId: row.lotId,
    openedBy: row.openedBy,
    reasonCode: row.reasonCode,
    reasonText: row.reasonText,
    status: row.status,
    resolutionAction: row.resolutionAction,
    resolutionNote: row.resolutionNote,
    resolvedBy: row.resolvedBy,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    lotStatus: extras?.lotStatus ?? null,
    orderId: extras?.orderId ?? null,
    orderExternalRef: extras?.orderExternalRef ?? null,
    producerName: extras?.producerName ?? null,
    producerEmail: extras?.producerEmail ?? null,
  };
}

export async function registerLotDisputeRoutes(
  app: FastifyInstance,
  db: Database,
  authenticate: (req: unknown, reply: unknown) => Promise<void>,
) {
  app.get("/lot-disputes", { preHandler: authenticate }, async (request) => {
    const user = request.user as AuthUser;
    if (!["association", "admin"].includes(user.role)) {
      throw new ApiError(403, "Forbidden");
    }
    const query = z
      .object({
        status: z.enum(["open", "resolved", "all"]).optional().default("open"),
      })
      .parse(request.query ?? {});

    const rows = await db.select().from(lotDisputes).orderBy(desc(lotDisputes.createdAt));
    const filtered =
      query.status === "all"
        ? rows
        : query.status === "resolved"
          ? rows.filter((r) => r.status !== "open" && r.status !== "investigating")
          : rows.filter((r) => r.status === "open" || r.status === "investigating");

    const enriched = await Promise.all(
      filtered.map(async (dispute) => {
        const [lot] = await db.select().from(lots).where(eq(lots.id, dispute.lotId)).limit(1);
        const [order] = lot
          ? await db.select().from(orders).where(eq(orders.id, lot.orderId)).limit(1)
          : [null];
        const [producer] = lot
          ? await db.select().from(users).where(eq(users.id, lot.producerId)).limit(1)
          : [null];
        return serializeDispute(dispute, {
          lotStatus: lot?.status,
          orderId: lot?.orderId,
          orderExternalRef: order?.externalRef ?? null,
          producerName: producer?.name ?? null,
          producerEmail: producer?.email ?? null,
        });
      }),
    );

    return { disputes: enriched };
  });

  app.post("/lot-disputes/:id/resolve", { preHandler: authenticate }, async (request) => {
    const user = request.user as AuthUser;
    if (!["association", "admin"].includes(user.role)) {
      throw new ApiError(403, "Forbidden");
    }
    const { id } = request.params as { id: string };
    const body = resolveLotDisputeSchema.parse(request.body ?? {});

    const [dispute] = await db.select().from(lotDisputes).where(eq(lotDisputes.id, id)).limit(1);
    if (!dispute) throw new ApiError(404, "Dispute not found");
    if (dispute.status !== "open") {
      throw new ApiError(400, "Dispute already resolved");
    }

    const [lot] = await db.select().from(lots).where(eq(lots.id, dispute.lotId)).limit(1);
    if (!lot) throw new ApiError(404, "Lot not found");

    if (body.action === "acknowledge" || body.action === "investigating") {
      // Integrity disputes: no lot status mutation required.
    } else if (body.action === "reassign_producer") {
      if (dispute.reasonCode === "data_mismatch") {
        throw new ApiError(400, "Use acknowledge or investigating for integrity disputes");
      }
      if (!body.producerId) throw new ApiError(400, "producerId required for reassignment");
      const [producer] = await db.select().from(users).where(eq(users.id, body.producerId)).limit(1);
      if (!producer || producer.role !== "producer") {
        throw new ApiError(404, "Producer not found");
      }
      await db
        .update(lots)
        .set({
          producerId: body.producerId,
          status: "awaiting_producer_confirmation",
          producerConfirmedAt: null,
          producerDeclinedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(lots.id, lot.id));
    } else if (body.action === "correct_and_resubmit") {
      if (dispute.reasonCode === "data_mismatch") {
        throw new ApiError(400, "Use acknowledge or investigating for integrity disputes");
      }
      await db
        .update(lots)
        .set({
          status: "awaiting_producer_confirmation",
          producerConfirmedAt: null,
          producerDeclinedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(lots.id, lot.id));
    } else if (body.action === "delete_lot") {
      if (dispute.reasonCode === "data_mismatch") {
        throw new ApiError(400, "Use acknowledge or investigating for integrity disputes");
      }
      if (lot.currentInspectionVersion > 0) {
        throw new ApiError(400, "Cannot delete a lot that already has inspections");
      }
      await db
        .update(lots)
        .set({
          status: "cancelled",
          updatedAt: new Date(),
        })
        .where(eq(lots.id, lot.id));
    }

    const statusByAction: Record<string, string> = {
      correct_and_resubmit: "resolved_correct_resubmit",
      reassign_producer: "resolved_reassign",
      delete_lot: "resolved_deleted",
      acknowledge: "resolved_acknowledged",
      investigating: "investigating",
    };

    const [resolved] = await db
      .update(lotDisputes)
      .set({
        status: statusByAction[body.action] ?? "resolved",
        resolutionAction: body.action,
        resolutionNote: body.resolutionNote ?? null,
        resolvedBy: user.id,
        resolvedAt: new Date(),
      })
      .where(eq(lotDisputes.id, id))
      .returning();

    const [updatedLot] = await db.select().from(lots).where(eq(lots.id, lot.id)).limit(1);

    return {
      dispute: serializeDispute(resolved!),
      lot: updatedLot
        ? {
            id: updatedLot.id,
            status: updatedLot.status,
            producerId: updatedLot.producerId,
          }
        : null,
    };
  });
}
