import { and, desc, eq, inArray } from "drizzle-orm";
import type OpenAI from "openai";
import {
  auditFindings,
  auditRuns,
  campaigns,
  lotDisputes,
  lots,
  orders,
  pricingCategories,
  pricingPolicies,
  settlements,
  users,
  type Database,
} from "@alpacto/database";
import {
  assertAssociationLot,
  assertAssociationOrder,
  resolveLotByIdOrPrefix,
  resolveOrderByIdOrRef,
  shortId,
} from "./ayni-role-scope.js";
import type { AyniToolHandlers } from "./ayni-producer-tools.js";

export const AYNI_ASSOCIATION_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "list_my_campaigns",
      description: "Lista campañas de la asociación autenticada (no de otras orgs).",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "list_my_orders",
      description: "Órdenes donde associationId pertenece a tu organización. Filtro opcional por status.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", description: "Ej. funded, accepting_lots, draft" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_my_lots",
      description: "Lotes de órdenes de tu asociación. Filtros opcionales: orderId, status, producerName.",
      parameters: {
        type: "object",
        properties: {
          orderId: { type: "string" },
          status: { type: "string" },
          producerName: { type: "string", description: "Filtro parcial por nombre del productor" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_my_lot",
      description: "Detalle de un lote en scope de tu asociación.",
      parameters: {
        type: "object",
        properties: { lotId: { type: "string" } },
        required: ["lotId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_my_disputes",
      description: "Disputas (declines / data_mismatch) de lotes de tu asociación.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", description: "open | acknowledged | investigating | resolved" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_my_dispute",
      description: "Detalle de una disputa en scope de tu asociación.",
      parameters: {
        type: "object",
        properties: { disputeId: { type: "string" } },
        required: ["disputeId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_my_lot_settlement",
      description: "Liquidación (PEN/USDC) de un lote en scope. Solo lectura.",
      parameters: {
        type: "object",
        properties: { lotId: { type: "string" } },
        required: ["lotId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_my_ayni_findings",
      description:
        "Hallazgos de la última auditoría Ayni de un lote en scope. Incluye resultCode, findings y failureReason si el pipeline falló.",
      parameters: {
        type: "object",
        properties: { lotId: { type: "string" } },
        required: ["lotId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_order_capacity",
      description: "Fondos restantes (USDC) y estado de una orden de tu asociación.",
      parameters: {
        type: "object",
        properties: {
          orderId: { type: "string", description: "UUID o externalRef" },
          lotId: { type: "string", description: "Alternativa: resolver orden desde un lote" },
        },
        additionalProperties: false,
      },
    },
  },
];

export function createAyniAssociationToolHandlers(opts: {
  db: Database;
  orgIds: string[];
}): AyniToolHandlers {
  const { db, orgIds } = opts;

  async function scopedLots() {
    if (orgIds.length === 0) return [];
    return db
      .select({
        lot: lots,
        order: orders,
        producerName: users.name,
        campaignName: campaigns.name,
      })
      .from(lots)
      .innerJoin(orders, eq(lots.orderId, orders.id))
      .innerJoin(users, eq(lots.producerId, users.id))
      .innerJoin(campaigns, eq(orders.campaignId, campaigns.id))
      .where(inArray(orders.associationId, orgIds));
  }

  return {
    async list_my_campaigns() {
      if (orgIds.length === 0) return { campaigns: [], message: "No perteneces a ninguna asociación." };
      const rows = await db
        .select({
          id: campaigns.id,
          name: campaigns.name,
          status: campaigns.status,
          startDate: campaigns.startDate,
          endDate: campaigns.endDate,
          buyerName: users.name,
        })
        .from(campaigns)
        .innerJoin(users, eq(campaigns.buyerId, users.id))
        .where(inArray(campaigns.organizationId, orgIds));
      return {
        campaigns: rows.map((c) => ({
          id: c.id,
          shortId: shortId(c.id),
          name: c.name,
          status: c.status,
          buyerName: c.buyerName,
          startDate: c.startDate?.toISOString() ?? null,
          endDate: c.endDate?.toISOString() ?? null,
        })),
      };
    },

    async list_my_orders(args) {
      if (orgIds.length === 0) return { orders: [] };
      const status = args["status"] ? String(args["status"]) : undefined;
      const rows = await db
        .select({
          order: orders,
          campaignName: campaigns.name,
          buyerName: users.name,
        })
        .from(orders)
        .innerJoin(campaigns, eq(orders.campaignId, campaigns.id))
        .innerJoin(users, eq(orders.buyerId, users.id))
        .where(
          status
            ? and(inArray(orders.associationId, orgIds), eq(orders.status, status))
            : inArray(orders.associationId, orgIds),
        );
      return {
        orders: rows.map(({ order: o, campaignName, buyerName }) => ({
          orderId: o.id,
          orderRef: o.externalRef ?? shortId(o.id),
          status: o.status,
          campaignName,
          buyerName,
          fundedUsdc: (Number(o.fundedUsdcUnits) / 1e6).toFixed(2),
          remainingUsdc: (Number(o.remainingUsdcUnits) / 1e6).toFixed(2),
          budgetUsd: (Number(o.budgetUsdCents) / 100).toFixed(2),
          targetWeightKg: o.targetWeightGrams != null ? Number(o.targetWeightGrams) / 1000 : null,
        })),
      };
    },

    async list_my_lots(args) {
      let rows = await scopedLots();
      if (args["orderId"]) {
        const raw = String(args["orderId"]);
        const order = await resolveOrderByIdOrRef(db, raw);
        if (!order || !orgIds.includes(order.associationId)) {
          return { error: "Orden no encontrada en tu asociación." };
        }
        rows = rows.filter((r) => r.lot.orderId === order.id);
      }
      if (args["status"]) {
        const st = String(args["status"]);
        rows = rows.filter((r) => r.lot.status === st);
      }
      if (args["producerName"]) {
        const q = String(args["producerName"]).toLowerCase();
        rows = rows.filter((r) => r.producerName.toLowerCase().includes(q));
      }
      return {
        total: rows.length,
        lots: rows.map((r) => ({
          lotId: r.lot.id,
          shortId: shortId(r.lot.id),
          status: r.lot.status,
          producerName: r.producerName,
          orderRef: r.order.externalRef ?? shortId(r.order.id),
          campaignName: r.campaignName,
          confirmedAt: r.lot.producerConfirmedAt?.toISOString() ?? null,
          declinedAt: r.lot.producerDeclinedAt?.toISOString() ?? null,
        })),
      };
    },

    async get_my_lot(args) {
      const all = await scopedLots();
      const match = await resolveLotByIdOrPrefix(
        all.map((r) => r.lot),
        String(args["lotId"] ?? ""),
      );
      if (!match) return { error: "Lote no encontrado en tu asociación." };
      const row = all.find((r) => r.lot.id === match.id)!;
      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, row.order.campaignId))
        .limit(1);
      let pricing: {
        currency: string;
        associationFeeBps: number;
        categories: { code: string; label: string; pricePenPerKg: string }[];
      } | null = null;
      if (campaign) {
        const [policy] = await db
          .select()
          .from(pricingPolicies)
          .where(eq(pricingPolicies.id, campaign.pricingPolicyId))
          .limit(1);
        if (policy) {
          const cats = await db
            .select()
            .from(pricingCategories)
            .where(eq(pricingCategories.pricingPolicyId, policy.id));
          pricing = {
            currency: policy.currency,
            associationFeeBps: policy.associationFeeBps,
            categories: cats.map((c) => ({
              code: c.code,
              label: c.label,
              pricePenPerKg: (Number(c.pricePenMinorPerKg) / 100).toFixed(2),
            })),
          };
        }
      }
      return {
        lot: {
          id: row.lot.id,
          shortId: shortId(row.lot.id),
          status: row.lot.status,
          currentInspectionVersion: row.lot.currentInspectionVersion,
          producerName: row.producerName,
          producerConfirmedAt: row.lot.producerConfirmedAt?.toISOString() ?? null,
          producerDeclinedAt: row.lot.producerDeclinedAt?.toISOString() ?? null,
          createdAt: row.lot.createdAt.toISOString(),
        },
        orderRef: row.order.externalRef ?? shortId(row.order.id),
        orderStatus: row.order.status,
        campaignName: row.campaignName,
        fundsSecured: ["funded", "accepting_lots", "partially_settled"].includes(row.order.status),
        pricing,
      };
    },

    async list_my_disputes(args) {
      if (orgIds.length === 0) return { disputes: [] };
      const status = args["status"] ? String(args["status"]) : undefined;
      const rows = await db
        .select({
          dispute: lotDisputes,
          lot: lots,
          order: orders,
          producerName: users.name,
        })
        .from(lotDisputes)
        .innerJoin(lots, eq(lotDisputes.lotId, lots.id))
        .innerJoin(orders, eq(lots.orderId, orders.id))
        .innerJoin(users, eq(lots.producerId, users.id))
        .where(
          status
            ? and(inArray(orders.associationId, orgIds), eq(lotDisputes.status, status))
            : inArray(orders.associationId, orgIds),
        )
        .orderBy(desc(lotDisputes.createdAt));
      return {
        disputes: rows.map((r) => ({
          disputeId: r.dispute.id,
          status: r.dispute.status,
          reasonCode: r.dispute.reasonCode,
          reasonText: r.dispute.reasonText,
          lotShortId: shortId(r.lot.id),
          lotId: r.lot.id,
          lotStatus: r.lot.status,
          producerName: r.producerName,
          orderRef: r.order.externalRef ?? shortId(r.order.id),
          createdAt: r.dispute.createdAt.toISOString(),
          resolutionAction: r.dispute.resolutionAction,
        })),
      };
    },

    async get_my_dispute(args) {
      const disputeId = String(args["disputeId"] ?? "");
      if (!disputeId) return { error: "Indica disputeId." };
      if (orgIds.length === 0) return { error: "Sin organización." };
      const [row] = await db
        .select({
          dispute: lotDisputes,
          lot: lots,
          order: orders,
          producerName: users.name,
        })
        .from(lotDisputes)
        .innerJoin(lots, eq(lotDisputes.lotId, lots.id))
        .innerJoin(orders, eq(lots.orderId, orders.id))
        .innerJoin(users, eq(lots.producerId, users.id))
        .where(and(eq(lotDisputes.id, disputeId), inArray(orders.associationId, orgIds)))
        .limit(1);
      if (!row) return { error: "Disputa no encontrada en tu asociación." };
      return {
        dispute: {
          id: row.dispute.id,
          status: row.dispute.status,
          reasonCode: row.dispute.reasonCode,
          reasonText: row.dispute.reasonText,
          resolutionAction: row.dispute.resolutionAction,
          resolutionNote: row.dispute.resolutionNote,
          resolvedAt: row.dispute.resolvedAt?.toISOString() ?? null,
          createdAt: row.dispute.createdAt.toISOString(),
        },
        lot: {
          id: row.lot.id,
          shortId: shortId(row.lot.id),
          status: row.lot.status,
          producerName: row.producerName,
        },
        orderRef: row.order.externalRef ?? shortId(row.order.id),
        note: "Para resolver (corregir/reasignar/cancelar) usa la pantalla Disputas; el chat es solo consulta.",
      };
    },

    async get_my_lot_settlement(args) {
      try {
        const all = await scopedLots();
        const match = await resolveLotByIdOrPrefix(
          all.map((r) => r.lot),
          String(args["lotId"] ?? ""),
        );
        if (!match) return { error: "Lote no encontrado en tu asociación." };
        const { lot } = await assertAssociationLot(db, orgIds, match.id);
        const [settlement] = await db
          .select()
          .from(settlements)
          .where(eq(settlements.lotId, lot.id))
          .orderBy(desc(settlements.acceptedAt))
          .limit(1);
        if (!settlement) return { lotId: lot.id, settlement: null, message: "Sin liquidación aún." };
        return {
          lotId: lot.id,
          shortId: shortId(lot.id),
          settlement: {
            status: settlement.status,
            weightKg: Number(settlement.weightGrams) / 1000,
            categoryCode: settlement.categoryCode,
            grossPen: (Number(settlement.grossPenMinor) / 100).toFixed(2),
            bonusPen: (Number(settlement.bonusPenMinor) / 100).toFixed(2),
            feePen: (Number(settlement.feePenMinor) / 100).toFixed(2),
            platformFeePen: (Number(settlement.platformFeePenMinor) / 100).toFixed(2),
            netPen: (Number(settlement.netPenMinor) / 100).toFixed(2),
            associationUsdc: (Number(settlement.associationUsdcUnits) / 1e6).toFixed(6),
            producerUsdc: (Number(settlement.producerUsdcUnits) / 1e6).toFixed(6),
            platformUsdc: (Number(settlement.platformUsdcUnits) / 1e6).toFixed(6),
            settlementTxHash: settlement.settlementTxHash,
          },
        };
      } catch (err) {
        return { error: err instanceof Error ? err.message : "Lote no encontrado." };
      }
    },

    async get_my_ayni_findings(args) {
      try {
        const all = await scopedLots();
        const match = await resolveLotByIdOrPrefix(
          all.map((r) => r.lot),
          String(args["lotId"] ?? ""),
        );
        if (!match) return { error: "Lote no encontrado en tu asociación." };
        const { lot } = await assertAssociationLot(db, orgIds, match.id);
        const [audit] = await db
          .select()
          .from(auditRuns)
          .where(eq(auditRuns.lotId, lot.id))
          .orderBy(desc(auditRuns.inspectionVersion), desc(auditRuns.startedAt))
          .limit(1);
        if (!audit) return { lotId: lot.id, audit: null, message: "Ayni aún no auditó este lote." };
        const findings = await db
          .select()
          .from(auditFindings)
          .where(eq(auditFindings.auditRunId, audit.id));
        return {
          lotId: lot.id,
          shortId: shortId(lot.id),
          resultCode: audit.resultCode,
          status: audit.status,
          failureReason: audit.status === "failed" ? audit.progressLabel : null,
          progressPhase: audit.progressPhase,
          findings: findings.map((f) => ({
            code: f.code,
            severity: f.severity,
            declaredValue: f.declaredValue,
            observedValue: f.observedValue,
            explanation: f.explanation,
          })),
        };
      } catch (err) {
        return { error: err instanceof Error ? err.message : "Lote no encontrado." };
      }
    },

    async get_order_capacity(args) {
      try {
        let orderId: string | undefined;
        if (args["lotId"]) {
          const all = await scopedLots();
          const match = await resolveLotByIdOrPrefix(
            all.map((r) => r.lot),
            String(args["lotId"]),
          );
          if (!match) return { error: "Lote no encontrado en tu asociación." };
          const { order } = await assertAssociationLot(db, orgIds, match.id);
          orderId = order.id;
        } else if (args["orderId"]) {
          const order = await resolveOrderByIdOrRef(db, String(args["orderId"]));
          if (!order) return { error: "Orden no encontrada." };
          await assertAssociationOrder(db, orgIds, order.id);
          orderId = order.id;
        } else {
          return { error: "Indica orderId o lotId." };
        }
        const order = await assertAssociationOrder(db, orgIds, orderId);
        const lotCount = await db.select().from(lots).where(eq(lots.orderId, order.id));
        return {
          orderRef: order.externalRef ?? shortId(order.id),
          orderStatus: order.status,
          fundsSecured: ["funded", "accepting_lots", "partially_settled"].includes(order.status),
          fundedUsdc: (Number(order.fundedUsdcUnits) / 1e6).toFixed(2),
          remainingUsdc: (Number(order.remainingUsdcUnits) / 1e6).toFixed(2),
          budgetUsd: (Number(order.budgetUsdCents) / 100).toFixed(2),
          lotCount: lotCount.length,
          targetWeightKg: order.targetWeightGrams != null ? Number(order.targetWeightGrams) / 1000 : null,
        };
      } catch (err) {
        return { error: err instanceof Error ? err.message : "Orden no encontrada." };
      }
    },
  };
}
