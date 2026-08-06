import { and, desc, eq } from "drizzle-orm";
import type OpenAI from "openai";
import {
  auditFindings,
  auditRuns,
  lots,
  orders,
  settlements,
  type Database,
} from "@alpacto/database";
import { loadProducerLotContext, loadProducerParticipation } from "./producer-context.js";
import { verifyLotIntegrity, type IntegrityResult } from "./verify-lot-integrity.js";
import { ApiError } from "./errors.js";

/** In-memory flag: integrity mismatch verified in this process for open_integrity_dispute gate. */
const recentAnomalies = new Map<string, number>();
const ANOMALY_TTL_MS = 15 * 60 * 1000;

function markAnomaly(producerId: string, lotId: string) {
  recentAnomalies.set(`${producerId}:${lotId}`, Date.now());
}

function hadRecentAnomaly(producerId: string, lotId: string): boolean {
  const key = `${producerId}:${lotId}`;
  const at = recentAnomalies.get(key);
  if (!at) return false;
  if (Date.now() - at > ANOMALY_TTL_MS) {
    recentAnomalies.delete(key);
    return false;
  }
  return true;
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

function estimateRemainingKg(remainingUsdc: bigint, pricePenPerKg: bigint, penPerUsdcMicros: bigint): number | null {
  // USDC 6 decimals; PEN minor = cents; penPerUsdcMicros ≈ PEN micros per 1 USDC
  // net PEN ≈ kg * pricePenPerKg; USDC ≈ (net PEN * 1e6) / (penPerUsdcMicros / 100)? 
  // From domain: typically penPerUsdcMicros is micros of PEN per USDC (3_750_000 = S/3.75)
  // usdcUnits = netPenMinor * 1_000_000 / (penPerUsdcMicros / 100) if pen is cents...
  // Simpler heuristic used in product: remainingUsdc / price_in_usdc_per_kg
  // pricePenMinorPerKg / 100 = soles; soles / (penPerUsdcMicros/1e6) = USDC per kg
  if (pricePenPerKg <= 0n || penPerUsdcMicros <= 0n) return null;
  // USDC units per kg ≈ pricePenMinorPerKg * 1e6 / (penPerUsdcMicros / 100)
  // penPerUsdcMicros is PEN micros per USDC: 3_750_000 = 3.75 PEN
  // price 2750 = S/27.50; USDC per kg = 27.50 / 3.75 = 7.333... → 7_333_333 units
  const usdcPerKg = (pricePenPerKg * 1_000_000n * 100n) / penPerUsdcMicros;
  if (usdcPerKg <= 0n) return null;
  const grams = (remainingUsdc * 1000n) / usdcPerKg;
  return Number(grams) / 1000;
}

export const AYNI_PRODUCER_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "list_my_lots",
      description:
        "Lista solo los lotes del productor autenticado, con orden, campaña y estado. No incluye lotes de otros productores.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_my_lot",
      description: "Detalle de un lote propio: orden, campaña, estado, confirmación.",
      parameters: {
        type: "object",
        properties: {
          lotId: { type: "string", description: "UUID del lote o prefijo de 8 caracteres" },
        },
        required: ["lotId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_my_lot_settlement",
      description: "Desglose de liquidación (PEN/USDC) y tx hash de un lote propio.",
      parameters: {
        type: "object",
        properties: {
          lotId: { type: "string" },
        },
        required: ["lotId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_my_order_capacity",
      description:
        "Capacidad restante de una orden donde el productor ya participa: USDC restante y estimación de kg. No lista lotes de otros productores.",
      parameters: {
        type: "object",
        properties: {
          orderId: { type: "string", description: "UUID de orden o externalRef (ej. ALP-2026-001)" },
          lotId: { type: "string", description: "Alternativa: resolver orden desde un lote propio" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_my_ayni_findings",
      description:
        "Hallazgos de la última auditoría Ayni de un lote propio. Incluye resultCode, findings y failureReason si el pipeline falló.",
      parameters: {
        type: "object",
        properties: {
          lotId: { type: "string" },
        },
        required: ["lotId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "verify_lot_integrity",
      description:
        "Compara Postgres y blockchain para un lote propio liquidado/aceptado. Si no coinciden, marca anomalía crítica.",
      parameters: {
        type: "object",
        properties: {
          lotId: { type: "string" },
        },
        required: ["lotId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "open_integrity_dispute",
      description:
        "Abre disputa de integridad (data_mismatch) solo después de verify_lot_integrity con mismatch. La ve la asociación.",
      parameters: {
        type: "object",
        properties: {
          lotId: { type: "string" },
          note: { type: "string", description: "Resumen corto de la anomalía" },
        },
        required: ["lotId"],
        additionalProperties: false,
      },
    },
  },
];

async function resolveOwnedLotId(db: Database, producerId: string, lotIdOrPrefix: string) {
  const raw = lotIdOrPrefix.trim();
  if (/^[0-9a-f-]{36}$/i.test(raw)) {
    const [lot] = await db.select().from(lots).where(eq(lots.id, raw)).limit(1);
    if (!lot || lot.producerId !== producerId) return null;
    return lot;
  }
  const mine = await db.select().from(lots).where(eq(lots.producerId, producerId));
  const matches = mine.filter((l) => l.id.startsWith(raw.toLowerCase()) || l.id.startsWith(raw));
  if (matches.length === 1) return matches[0]!;
  if (matches.length > 1) {
    throw new ApiError(400, `Varios lotes coinciden con "${raw}". Usa el UUID completo.`);
  }
  return null;
}

export type AyniToolHandlers = Record<string, (args: Record<string, unknown>) => Promise<unknown>>;

export function createAyniProducerToolHandlers(opts: {
  db: Database;
  producerId: string;
  openIntegrityDispute: (lotId: string, note?: string) => Promise<unknown>;
}): AyniToolHandlers {
  const { db, producerId, openIntegrityDispute } = opts;

  return {
    async list_my_lots() {
      const data = await loadProducerParticipation(db, producerId);
      return {
        totalLots: data.totalLots,
        orders: data.orders.map((o) => ({
          orderRef: o.externalRef ?? shortId(o.orderId),
          orderStatus: o.orderStatus,
          fundsSecured: o.fundsSecured,
          campaignName: o.campaign.name,
          associationName: o.campaign.associationName,
          myLotCount: o.lotCount,
          lots: o.lots.map((l) => ({
            lotId: l.id,
            shortId: shortId(l.id),
            status: l.status,
            createdAt: l.createdAt,
          })),
        })),
      };
    },

    async get_my_lot(args) {
      const lotId = String(args["lotId"] ?? "");
      const lot = await resolveOwnedLotId(db, producerId, lotId);
      if (!lot) return { error: "Lote no encontrado o no es tuyo." };
      const ctx = await loadProducerLotContext(db, producerId, lot.id);
      return {
        lot: {
          id: lot.id,
          shortId: shortId(lot.id),
          status: lot.status,
          currentInspectionVersion: lot.currentInspectionVersion,
          producerConfirmedAt: lot.producerConfirmedAt?.toISOString() ?? null,
          producerDeclinedAt: lot.producerDeclinedAt?.toISOString() ?? null,
          createdAt: lot.createdAt.toISOString(),
        },
        orderRef: ctx?.externalRef ?? shortId(lot.orderId),
        orderStatus: ctx?.orderStatus ?? null,
        fundsSecured: ctx?.fundsSecured ?? null,
        campaignName: ctx?.campaign.name ?? null,
        associationName: ctx?.campaign.associationName ?? null,
        pricing: ctx?.campaign.pricing
          ? {
              currency: ctx.campaign.pricing.currency,
              associationFeeBps: ctx.campaign.pricing.associationFeeBps,
              categories: ctx.campaign.pricing.categories.map((c) => ({
                code: c.code,
                label: c.label,
                pricePenPerKg: (Number(c.pricePenMinorPerKg) / 100).toFixed(2),
              })),
            }
          : null,
      };
    },

    async get_my_lot_settlement(args) {
      const lot = await resolveOwnedLotId(db, producerId, String(args["lotId"] ?? ""));
      if (!lot) return { error: "Lote no encontrado o no es tuyo." };
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
          producerUsdc: (Number(settlement.producerUsdcUnits) / 1e6).toFixed(6),
          associationUsdc: (Number(settlement.associationUsdcUnits) / 1e6).toFixed(6),
          platformUsdc: (Number(settlement.platformUsdcUnits) / 1e6).toFixed(6),
          settlementTxHash: settlement.settlementTxHash,
          acceptedAt: settlement.acceptedAt?.toISOString() ?? null,
          settledAt: settlement.settledAt?.toISOString() ?? null,
        },
      };
    },

    async get_my_order_capacity(args) {
      let orderRow: typeof orders.$inferSelect | undefined;
      let myLotsOnOrder: (typeof lots.$inferSelect)[] = [];

      if (args["lotId"]) {
        const lot = await resolveOwnedLotId(db, producerId, String(args["lotId"]));
        if (!lot) return { error: "Lote no encontrado o no es tuyo." };
        const [o] = await db.select().from(orders).where(eq(orders.id, lot.orderId)).limit(1);
        orderRow = o;
        myLotsOnOrder = await db
          .select()
          .from(lots)
          .where(and(eq(lots.producerId, producerId), eq(lots.orderId, lot.orderId)));
      } else if (args["orderId"]) {
        const raw = String(args["orderId"]).trim();
        if (/^[0-9a-f-]{36}$/i.test(raw)) {
          const [byId] = await db.select().from(orders).where(eq(orders.id, raw)).limit(1);
          orderRow = byId;
        }
        if (!orderRow) {
          const [byRef] = await db.select().from(orders).where(eq(orders.externalRef, raw)).limit(1);
          orderRow = byRef;
        }
        if (!orderRow) return { error: "Orden no encontrada." };
        myLotsOnOrder = await db
          .select()
          .from(lots)
          .where(and(eq(lots.producerId, producerId), eq(lots.orderId, orderRow.id)));
        if (myLotsOnOrder.length === 0) {
          return { error: "No participas en esa orden; no puedo mostrar su capacidad." };
        }
      } else {
        return { error: "Indica orderId o lotId." };
      }

      if (!orderRow || myLotsOnOrder.length === 0) {
        return { error: "No participas en esa orden; no puedo mostrar su capacidad." };
      }

      const ctx = await loadProducerLotContext(db, producerId, myLotsOnOrder[0]!.id);
      const fine = ctx?.campaign.pricing?.categories.find((c) => c.code === "FINE");
      const price = fine ? BigInt(fine.pricePenMinorPerKg) : 0n;
      const penPerUsdcMicros = ctx?.campaign.pricing?.penPerUsdcMicros
        ? BigInt(ctx.campaign.pricing.penPerUsdcMicros)
        : 3_750_000n;
      const remaining = orderRow.remainingUsdcUnits;
      const estKg = estimateRemainingKg(remaining, price, penPerUsdcMicros);

      return {
        orderRef: orderRow.externalRef ?? shortId(orderRow.id),
        orderStatus: orderRow.status,
        fundsSecured: ["funded", "accepting_lots", "partially_settled"].includes(orderRow.status),
        remainingUsdc: (Number(remaining) / 1e6).toFixed(2),
        estimatedRemainingKgAtFine: estKg != null ? Number(estKg.toFixed(1)) : null,
        note: "Estimación a precio FINE de la campaña. No muestra lotes de otros productores.",
        myLotsOnOrder: myLotsOnOrder.map((l) => ({ shortId: shortId(l.id), status: l.status })),
      };
    },

    async get_my_ayni_findings(args) {
      const lot = await resolveOwnedLotId(db, producerId, String(args["lotId"] ?? ""));
      if (!lot) return { error: "Lote no encontrado o no es tuyo." };
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
    },

    async verify_lot_integrity(args) {
      const lot = await resolveOwnedLotId(db, producerId, String(args["lotId"] ?? ""));
      if (!lot) return { error: "Lote no encontrado o no es tuyo." };
      const result: IntegrityResult = await verifyLotIntegrity(db, producerId, lot.id);
      if (!result.match && result.mode === "mismatch") {
        markAnomaly(producerId, lot.id);
      }
      return result;
    },

    async open_integrity_dispute(args) {
      const lot = await resolveOwnedLotId(db, producerId, String(args["lotId"] ?? ""));
      if (!lot) return { error: "Lote no encontrado o no es tuyo." };
      if (!hadRecentAnomaly(producerId, lot.id)) {
        return {
          error:
            "Primero usa verify_lot_integrity. Solo puedes abrir disputa si hay mismatch confirmado.",
        };
      }
      const note = args["note"] ? String(args["note"]).slice(0, 2000) : undefined;
      return openIntegrityDispute(lot.id, note);
    },
  };
}
