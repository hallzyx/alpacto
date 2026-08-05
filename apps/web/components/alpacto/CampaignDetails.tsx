"use client";

import { StatusPill } from "./StatusPill";
import { PricingPolicyHelpButton } from "./PricingPolicyHelp";
import { formatPen } from "~~/lib/format";
import type { Campaign } from "~~/lib/types";

function formatDay(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-PE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

type CampaignDetailsProps = {
  campaign: Campaign;
  compact?: boolean;
};

export function CampaignDetails({ campaign, compact = false }: CampaignDetailsProps) {
  const pricing = campaign.pricing;
  const feePct = pricing ? (pricing.associationFeeBps / 100).toFixed(1) : null;
  const fx =
    pricing && Number(pricing.penPerUsdcMicros) > 0 ? (Number(pricing.penPerUsdcMicros) / 1_000_000).toFixed(2) : null;

  return (
    <div className={compact ? undefined : "alp-panel"} style={compact ? { marginTop: "0.75rem" } : undefined}>
      {!compact ? (
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <h2 className="alp-title" style={{ fontSize: "1.25rem", margin: 0 }}>
            {campaign.name}
          </h2>
          <StatusPill status={campaign.status} />
        </div>
      ) : (
        <p className="alp-muted" style={{ margin: "0 0 0.5rem" }}>
          Detalle de campaña seleccionada
        </p>
      )}

      <dl className="alp-kv" style={{ marginTop: compact ? 0 : "0.75rem" }}>
        <dt>Asociación</dt>
        <dd>{campaign.associationName ?? "—"}</dd>
        <dt>Comprador</dt>
        <dd>
          {campaign.buyerName ?? "—"}
          {campaign.buyerEmail ? (
            <span className="alp-muted" style={{ display: "block", fontSize: "0.85rem" }}>
              {campaign.buyerEmail}
            </span>
          ) : null}
        </dd>
        <dt>Ventana</dt>
        <dd>
          {formatDay(campaign.startDate)} → {formatDay(campaign.endDate)}
        </dd>
        {feePct ? (
          <>
            <dt>Comisión asociación</dt>
            <dd>{feePct}%</dd>
          </>
        ) : null}
        {fx ? (
          <>
            <dt>Tipo de cambio (demo)</dt>
            <dd>S/ {fx} por USD</dd>
          </>
        ) : null}
      </dl>

      {pricing?.categories?.length ? (
        <div style={{ marginTop: "0.75rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", marginBottom: "0.35rem" }}>
            <h3 className="alp-title" style={{ fontSize: "1rem", margin: 0 }}>
              Tabla de precios
            </h3>
            <PricingPolicyHelpButton policy={pricing} />
          </div>
          <div className="alp-list">
            {pricing.categories.map(cat => (
              <div key={cat.code} className="alp-lot-row" style={{ padding: "0.25rem 0" }}>
                <span className="alp-lot-row__id">
                  {cat.label} ({cat.code})
                </span>
                <span className="alp-muted">
                  {formatPen(cat.pricePenMinorPerKg)}
                  {Number(cat.qualityBonusPenMinorPerKg) > 0
                    ? ` + prima ${formatPen(cat.qualityBonusPenMinorPerKg)}`
                    : ""}{" "}
                  / kg
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="alp-muted" style={{ marginTop: "0.75rem", marginBottom: 0 }}>
          Sin tabla de precios vinculada.
        </p>
      )}
    </div>
  );
}
