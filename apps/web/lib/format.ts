/** Format PEN minor units (céntimos) as `S/ x.xx`. */
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

/** Format weight grams as kg with one decimal. */
export function formatKg(grams: string | number | bigint | null | undefined): string {
  if (grams === null || grams === undefined || grams === "") return "—";
  const n = typeof grams === "bigint" ? Number(grams) : Number(grams);
  if (!Number.isFinite(n)) return "—";
  return `${(n / 1000).toFixed(1)} kg`;
}

/** Human-readable lot / order status (Spanish). */
export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    registered: "Registrado",
    inspection_submitted: "Inspección enviada",
    audit_pending: "Auditoría pendiente",
    audit_passed: "Ayni aprobado",
    audit_warning: "Ayni con aviso",
    audit_review: "Revisión Ayni",
    reweighing_requested: "Nuevo pesaje",
    settlement_accepted: "Liquidación aceptada",
    settled: "Liquidado",
    draft: "Borrador",
    payment_pending: "Pago pendiente",
    funded: "Fondeado",
    accepting_lots: "Recibiendo lotes",
    partially_settled: "Parcialmente liquidado",
    closed: "Cerrado",
    active: "Activa",
    pass: "Aprobado",
    warning: "Aviso",
    review_required: "Revisión requerida",
    unreadable: "No legible",
    pending: "Pendiente",
    completed: "Completado",
    failed: "Fallido",
    simulated_paid: "Simulado pagado",
  };
  return map[status] ?? status.replace(/_/g, " ");
}
