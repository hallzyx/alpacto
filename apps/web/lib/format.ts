/** Human-readable order reference for producer-facing UI. */
export function orderDisplayRef(externalRef: string | null | undefined, orderId: string): string {
  if (externalRef) return externalRef;
  return `Orden ${orderId.slice(0, 8)}`;
}

export function formatPen(penMinor: string | number | bigint | null | undefined): string {
  if (penMinor === null || penMinor === undefined || penMinor === "") return "S/ —";
  const n = typeof penMinor === "bigint" ? Number(penMinor) : Number(penMinor);
  if (!Number.isFinite(n)) return "S/ —";
  return `S/ ${(n / 100).toFixed(2)}`;
}

/** Format USD cents as `$x.xx`. */
export function formatUsdCents(cents: string | number | bigint | null | undefined): string {
  if (cents === null || cents === undefined || cents === "") return "$—";
  const n = typeof cents === "bigint" ? Number(cents) : Number(cents);
  if (!Number.isFinite(n)) return "$—";
  return `$${(n / 100).toFixed(2)}`;
}

/**
 * Calendar day (campaign start/end). Uses UTC so `YYYY-MM-DD` / midnight-UTC
 * ISO strings do not shift to the previous day in Peru (UTC−5).
 */
export function formatCalendarDate(
  value: string | null | undefined,
  opts?: { month?: "short" | "long" | "numeric"; day?: "numeric" | "2-digit" },
): string {
  if (!value) return "—";
  const day = value.includes("T") ? value.slice(0, 10) : value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    const [y, m, d] = day.split("-").map(Number);
    const date = new Date(Date.UTC(y!, m! - 1, d!));
    return date.toLocaleDateString("es-PE", {
      timeZone: "UTC",
      year: "numeric",
      month: opts?.month ?? "short",
      day: opts?.day ?? "numeric",
    });
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("es-PE", {
    timeZone: "UTC",
    year: "numeric",
    month: opts?.month ?? "short",
    day: opts?.day ?? "numeric",
  });
}

/** Format weight grams as kg with one decimal. */
export function formatKg(grams: string | number | bigint | null | undefined): string {
  if (grams === null || grams === undefined || grams === "") return "—";
  const n = typeof grams === "bigint" ? Number(grams) : Number(grams);
  if (!Number.isFinite(n)) return "—";
  return `${(n / 1000).toFixed(1)} kg`;
}

/** Format demo escrow balance (USDC 6-decimal units, 1:1 USD) as `$x.xx`. */
export function formatEscrowUsd(usdcUnits: string | number | bigint | null | undefined): string {
  if (usdcUnits === null || usdcUnits === undefined || usdcUnits === "") return "$—";
  const n = typeof usdcUnits === "bigint" ? Number(usdcUnits) : Number(usdcUnits);
  if (!Number.isFinite(n)) return "$—";
  const usd = n / 1_000_000;
  if (usd === 0) return "$0.00";
  // Dust remainders (rounding) would otherwise collapse to "$0.00".
  if (Math.abs(usd) < 0.01) {
    const s = usd.toFixed(6).replace(/\.?0+$/, "");
    return `$${s}`;
  }
  return `$${usd.toFixed(2)}`;
}

/** Shorten a 0x address for display. */
export function shortAddress(address: string | null | undefined): string {
  if (!address || address.length < 12) return address ?? "—";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Shorten a 0x transaction hash for display. */
export function shortTxHash(hash: string | null | undefined): string {
  if (!hash || hash.length < 12) return hash ?? "—";
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

export const ONCHAIN_ACTIVITY_LABELS: Record<string, string> = {
  order_funded: "Depósito orden",
  lot_registered: "Registro lote",
  inspection: "Inspección registrada",
  audit_attest: "Veredicto Ayni",
  settlement: "Liquidación",
  reweigh: "Re-pesaje",
  remainder_withdraw: "Retiro remanente",
};

/** Human-readable lot / order status (Spanish). */
export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    registered: "Registrado",
    awaiting_producer_confirmation: "Pendiente de tu confirmación",
    producer_declined: "Declinado — en disputa",
    cancelled: "Cancelado",
    inspection_submitted: "Inspección enviada",
    auditing: "Ayni revisando",
    ready_for_review: "Listo para liquidar",
    review_required: "Revisión requerida",
    audit_failed: "Auditoría fallida",
    audit_pending: "Auditoría pendiente",
    audit_passed: "Ayni aprobado",
    audit_warning: "Ayni con aviso",
    audit_review: "Revisión Ayni",
    reweighing_requested: "Nuevo pesaje",
    settlement_accepted: "Liquidación aceptada",
    settled: "Liquidado",
    draft: "Borrador",
    payment_pending: "Pago pendiente",
    funded: "Con fondos",
    accepting_lots: "Recibiendo lotes",
    partially_settled: "Parcialmente liquidado",
    closed: "Cerrado",
    active: "Activa",
    pass: "Aprobado",
    warning: "Aviso",
    unreadable: "No legible",
    pending: "Pendiente",
    completed: "Completado",
    failed: "Fallido",
    PIPELINE_FAILED: "Fallo técnico de Ayni",
    WEIGHT_MISMATCH: "Peso no cuadra",
    CATEGORY_MISMATCH: "Categoría no cuadra",
    simulated_paid: "Simulado pagado",
    open: "Abierta",
    investigating: "En investigación",
    resolved_acknowledged: "Reconocida",
    data_mismatch: "Datos del sistema no coinciden",
    wrong_weight: "Peso incorrecto",
    wrong_producer: "Productor equivocado",
    not_my_fiber: "No es mi fibra",
    wrong_order: "Orden equivocada",
    other: "Otro",
    acknowledge: "Reconocida",
  };
  return map[status] ?? status.replace(/_/g, " ");
}
