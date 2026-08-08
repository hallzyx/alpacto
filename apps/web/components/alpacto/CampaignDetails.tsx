"use client";

import { StatusPill } from "./StatusPill";
import { PricingPolicyHelpButton } from "./PricingPolicyHelp";
import { Card, CardContent, CardHeader, CardTitle } from "~~/components/ui/card";
import { formatCalendarDate, formatPen } from "~~/lib/format";
import type { Campaign } from "~~/lib/types";

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
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="font-display text-xl">{campaign.name}</CardTitle>
          <StatusPill status={campaign.status} />
        </div>
        {compact ? <p className="text-sm text-muted-foreground">Detalle de campaña seleccionada</p> : null}
      </CardHeader>
      <CardContent className="grid gap-6">
        <dl className="grid gap-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Asociación</dt>
            <dd className="font-medium">{campaign.associationName ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Comprador</dt>
            <dd className="text-right font-medium">
              {campaign.buyerName ?? "—"}
              {campaign.buyerEmail ? (
                <span className="block text-xs font-normal text-muted-foreground">{campaign.buyerEmail}</span>
              ) : null}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Ventana</dt>
            <dd className="font-medium">
              {formatCalendarDate(campaign.startDate)} → {formatCalendarDate(campaign.endDate)}
            </dd>
          </div>
          {feePct ? (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Comisión asociación</dt>
              <dd className="font-medium">{feePct}%</dd>
            </div>
          ) : null}
          {fx ? (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Tipo de cambio (demo)</dt>
              <dd className="font-medium">S/ {fx} por USD</dd>
            </div>
          ) : null}
        </dl>

        {pricing?.categories?.length ? (
          <div>
            <div className="mb-3 flex items-center gap-2">
              <h3 className="text-base font-semibold">Tabla de precios</h3>
              <PricingPolicyHelpButton policy={pricing} />
            </div>
            <div className="grid gap-2">
              {pricing.categories.map(cat => (
                <div
                  key={cat.code}
                  className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2"
                >
                  <span className="font-medium">
                    {cat.label} ({cat.code})
                  </span>
                  <span className="text-sm text-muted-foreground">
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
          <p className="text-sm text-muted-foreground">Sin tabla de precios vinculada.</p>
        )}
      </CardContent>
    </Card>
  );
}
