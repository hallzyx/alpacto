import { and, desc, eq } from "drizzle-orm";
import type OpenAI from "openai";
import {
  campaigns,
  fundingIntents,
  lots,
  orders,
  organizations,
  pricingCategories,
  pricingPolicies,
  settlements,
  users,
  type Database,
} from "@alpacto/database";
import {
  assertBuyerLot,
  resolveLotByIdOrPrefix,
  resolveOrderByIdOrRef,
  shortId,
} from "./ayni-role-scope.js";
import type { AyniToolHandlers } from "./ayni-producer-tools.js";

export const AYNI_BUYER_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "list_my_orders",
      description: "Lista solo las órdenes del comprador autenticado (buyerId).",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_my_order",
      description: "Detalle de una orden propia: presupuesto, fondos, campaña, asociación.",
      parameters: {
        type: "object",
        properties: {
          orderId: { type: "string", description: "UUID o externalRef" },
        },
        required: ["orderId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_my_order_funding",
      description: "Estado de fondeo / escrow de una orden propia (funded, remaining, intents).",
      parameters: {
        type: "object",
        properties: {
          orderId: { type: "string" },
        },
        required: ["orderId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_order_lots",
      description:
        "Lotes de una orden propia. Incluye nombre del productor (sin email ni wallet).",
      parameters: {
        type: "object",
        properties: {
          orderId: { type: "string" },
          status: { type: "string" },
        },
        required: ["orderId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_order_lot",
      description: "Detalle de un lote que pertenece a una orden del comprador autenticado.",
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
      name: "get_campaign_pricing",
      description: "Política de precios de una campaña donde el usuario es el buyer.",
      parameters: {
        type: "object",
        properties: {
          campaignId: { type: "string" },
          orderId: { type: "string", description: "Alternativa: resolver campaña desde orden propia" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_lot_settlement",
      description: "Liquidación read-only de un lote en una orden propia.",
      parameters: {
        type: "object",
        properties: { lotId: { type: "string" } },
        required: ["lotId"],
        additionalProperties: false,
      },
    },
  },
];

export function createAyniBuyerToolHandlers(opts: {
  db: Database;
  buyerId: string;
}): AyniToolHandlers {
  const { db, buyerId } = opts;

  async function ownedOrder(raw: string) {
    const order = await resolveOrderByIdOrRef(db, raw);
    if (!order || order.buyerId !== buyerId) return null;
    return order;
  }

  return {
    async list_my_orders(args) {
      const status = args["status"] ? String(args["status"]) : undefined;
      const rows = await db
        .select({
          order: orders,
          campaignName: campaigns.name,
          associationName: organizations.name,
        })
        .from(orders)
        .innerJoin(campaigns, eq(orders.campaignId, campaigns.id))
        .innerJoin(organizations, eq(orders.associationId, organizations.id))
        .where(status ? and(eq(orders.buyerId, buyerId), eq(orders.status, status)) : eq(orders.buyerId, buyerId));
      return {
        orders: rows.map(({ order: o, campaignName, associationName }) => ({
          orderId: o.id,
          orderRef: o.externalRef ?? shortId(o.id),
          status: o.status,
          campaignName,
          associationName,
          fundedUsdc: (Number(o.fundedUsdcUnits) / 1e6).toFixed(2),
          remainingUsdc: (Number(o.remainingUsdcUnits) / 1e6).toFixed(2),
          budgetUsd: (Number(o.budgetUsdCents) / 100).toFixed(2),
          fundsSecured: ["funded", "accepting_lots", "partially_settled"].includes(o.status),
          targetWeightKg: o.targetWeightGrams != null ? Number(o.targetWeightGrams) / 1000 : null,
        })),
      };
    },

    async get_my_order(args) {
      const order = await ownedOrder(String(args["orderId"] ?? ""));
      if (!order) return { error: "Orden no encontrada o no es tuya." };
      const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, order.campaignId)).limit(1);
      const [assoc] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, order.associationId))
        .limit(1);
      const lotRows = await db.select().from(lots).where(eq(lots.orderId, order.id));
      return {
        order: {
          id: order.id,
          orderRef: order.externalRef ?? shortId(order.id),
          status: order.status,
          budgetUsd: (Number(order.budgetUsdCents) / 100).toFixed(2),
          fundedUsdc: (Number(order.fundedUsdcUnits) / 1e6).toFixed(2),
          remainingUsdc: (Number(order.remainingUsdcUnits) / 1e6).toFixed(2),
          fundsSecured: ["funded", "accepting_lots", "partially_settled"].includes(order.status),
          targetWeightKg: order.targetWeightGrams != null ? Number(order.targetWeightGrams) / 1000 : null,
          txHash: order.txHash,
          lotCount: lotRows.length,
        },
        campaignName: campaign?.name ?? null,
        associationName: assoc?.name ?? null,
      };
    },

    async get_my_order_funding(args) {
      const order = await ownedOrder(String(args["orderId"] ?? ""));
      if (!order) return { error: "Orden no encontrada o no es tuya." };
      const intents = await db
        .select()
        .from(fundingIntents)
        .where(eq(fundingIntents.orderId, order.id))
        .orderBy(desc(fundingIntents.createdAt));
      return {
        orderRef: order.externalRef ?? shortId(order.id),
        orderStatus: order.status,
        fundsSecured: ["funded", "accepting_lots", "partially_settled"].includes(order.status),
        fundedUsdc: (Number(order.fundedUsdcUnits) / 1e6).toFixed(2),
        remainingUsdc: (Number(order.remainingUsdcUnits) / 1e6).toFixed(2),
        budgetUsd: (Number(order.budgetUsdCents) / 100).toFixed(2),
        fundingTxHash: order.txHash,
        intents: intents.map((i) => ({
          status: i.status,
          usd: (Number(i.usdCents) / 100).toFixed(2),
          usdc: (Number(i.usdcUnits) / 1e6).toFixed(2),
          fundingTxHash: i.fundingTxHash,
          createdAt: i.createdAt.toISOString(),
        })),
        note: "El fondeo se hace en la UI (Stripe Sandbox). Este chat no financia órdenes.",
      };
    },

    async list_order_lots(args) {
      const order = await ownedOrder(String(args["orderId"] ?? ""));
      if (!order) return { error: "Orden no encontrada o no es tuya." };
      const status = args["status"] ? String(args["status"]) : undefined;
      const rows = await db
        .select({ lot: lots, producerName: users.name })
        .from(lots)
        .innerJoin(users, eq(lots.producerId, users.id))
        .where(status ? and(eq(lots.orderId, order.id), eq(lots.status, status)) : eq(lots.orderId, order.id));
      return {
        orderRef: order.externalRef ?? shortId(order.id),
        lots: rows.map((r) => ({
          lotId: r.lot.id,
          shortId: shortId(r.lot.id),
          status: r.lot.status,
          producerName: r.producerName,
          confirmedAt: r.lot.producerConfirmedAt?.toISOString() ?? null,
          inspectionVersion: r.lot.currentInspectionVersion,
        })),
      };
    },

    async get_order_lot(args) {
      try {
        const raw = String(args["lotId"] ?? "");
        let lotId = raw;
        if (!/^[0-9a-f-]{36}$/i.test(raw)) {
          const mine = await db
            .select({ lot: lots })
            .from(lots)
            .innerJoin(orders, eq(lots.orderId, orders.id))
            .where(eq(orders.buyerId, buyerId));
          const match = await resolveLotByIdOrPrefix(
            mine.map((r) => r.lot),
            raw,
          );
          if (!match) return { error: "Lote no encontrado en tus órdenes." };
          lotId = match.id;
        }
        const { lot, order } = await assertBuyerLot(db, buyerId, lotId);
        const [producer] = await db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, lot.producerId))
          .limit(1);
        return {
          lot: {
            id: lot.id,
            shortId: shortId(lot.id),
            status: lot.status,
            producerName: producer?.name ?? "—",
            currentInspectionVersion: lot.currentInspectionVersion,
            producerConfirmedAt: lot.producerConfirmedAt?.toISOString() ?? null,
            producerDeclinedAt: lot.producerDeclinedAt?.toISOString() ?? null,
          },
          orderRef: order.externalRef ?? shortId(order.id),
          orderStatus: order.status,
        };
      } catch (err) {
        return { error: err instanceof Error ? err.message : "Lote no encontrado." };
      }
    },

    async get_campaign_pricing(args) {
      let campaignId = args["campaignId"] ? String(args["campaignId"]) : undefined;
      if (!campaignId && args["orderId"]) {
        const order = await ownedOrder(String(args["orderId"]));
        if (!order) return { error: "Orden no encontrada o no es tuya." };
        campaignId = order.campaignId;
      }
      if (!campaignId) return { error: "Indica campaignId u orderId." };
      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(and(eq(campaigns.id, campaignId), eq(campaigns.buyerId, buyerId)))
        .limit(1);
      if (!campaign) return { error: "Campaña no encontrada o no eres el comprador." };
      const [policy] = await db
        .select()
        .from(pricingPolicies)
        .where(eq(pricingPolicies.id, campaign.pricingPolicyId))
        .limit(1);
      if (!policy) return { error: "Política de precios no encontrada." };
      const cats = await db
        .select()
        .from(pricingCategories)
        .where(eq(pricingCategories.pricingPolicyId, policy.id));
      return {
        campaign: { id: campaign.id, name: campaign.name, status: campaign.status },
        pricing: {
          currency: policy.currency,
          associationFeeBps: policy.associationFeeBps,
          platformFeeBps: policy.platformFeeBps,
          weightToleranceBps: policy.weightToleranceBps,
          categories: cats.map((c) => ({
            code: c.code,
            label: c.label,
            pricePenPerKg: (Number(c.pricePenMinorPerKg) / 100).toFixed(2),
            qualityBonusPenPerKg: (Number(c.qualityBonusPenMinorPerKg) / 100).toFixed(2),
          })),
        },
      };
    },

    async get_lot_settlement(args) {
      try {
        const { lot } = await assertBuyerLot(db, buyerId, String(args["lotId"] ?? ""));
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
            feePen: (Number(settlement.feePenMinor) / 100).toFixed(2),
            netPen: (Number(settlement.netPenMinor) / 100).toFixed(2),
            producerUsdc: (Number(settlement.producerUsdcUnits) / 1e6).toFixed(6),
            associationUsdc: (Number(settlement.associationUsdcUnits) / 1e6).toFixed(6),
            platformUsdc: (Number(settlement.platformUsdcUnits) / 1e6).toFixed(6),
            settlementTxHash: settlement.settlementTxHash,
          },
          note: "Solo lectura. Aceptar liquidación es acción del productor en su panel.",
        };
      } catch (err) {
        return { error: err instanceof Error ? err.message : "Lote no encontrado." };
      }
    },
  };
}
