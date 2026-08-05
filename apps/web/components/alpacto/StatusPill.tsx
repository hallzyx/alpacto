"use client";

import { statusLabel } from "~~/lib/format";

const TONE: Record<string, string> = {
  registered: "mist",
  awaiting_producer_confirmation: "warn",
  producer_declined: "err",
  cancelled: "mist",
  inspection_submitted: "teal",
  auditing: "teal",
  ready_for_review: "ok",
  review_required: "warn",
  audit_failed: "err",
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
  unreadable: "warn",
  failed: "err",
  active: "ok",
  open: "warn",
};

export function StatusPill({ status, label }: { status: string; label?: string }) {
  const tone = TONE[status] ?? "mist";
  return (
    <span className={`alp-status alp-status--${tone}`} data-status={status}>
      {label ?? statusLabel(status)}
    </span>
  );
}
