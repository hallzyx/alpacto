"use client";

import { statusLabel } from "~~/lib/format";

const TONE: Record<string, string> = {
  registered: "mist",
  inspection_submitted: "teal",
  audit_pending: "teal",
  audit_passed: "ok",
  audit_warning: "warn",
  audit_review: "warn",
  reweighing_requested: "warn",
  settlement_accepted: "ok",
  settled: "ok",
  draft: "mist",
  payment_pending: "teal",
  funded: "ok",
  accepting_lots: "teal",
  pass: "ok",
  warning: "warn",
  review_required: "warn",
  failed: "err",
  active: "ok",
};

export function StatusPill({ status, label }: { status: string; label?: string }) {
  const tone = TONE[status] ?? "mist";
  return (
    <span className={`alp-status alp-status--${tone}`} data-status={status}>
      {label ?? statusLabel(status)}
    </span>
  );
}
