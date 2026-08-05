"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { StatusPill } from "~~/components/alpacto/StatusPill";
import { Badge } from "~~/components/ui/badge";
import { Button } from "~~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~~/components/ui/card";
import { formatPen } from "~~/lib/format";
import type { ProducerOrderParticipation } from "~~/lib/types";

function orderLabel(participation: ProducerOrderParticipation) {
  return participation.externalRef ?? `Orden ${participation.orderId.slice(0, 8)}`;
}

function formatCampaignWindow(start: string | null, end: string | null) {
  if (!start && !end) return null;
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("es-PE", { month: "short", day: "numeric", year: "numeric" });
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  if (start) return `Desde ${fmt(start)}`;
  return `Hasta ${fmt(end!)}`;
}

type Props = {
  participation: ProducerOrderParticipation;
  /** Highlight one lot in the list (detail page). */
  highlightLotId?: string;
  /** Show compact pricing only (dashboard cards). */
  compact?: boolean;
  /** Link to lots page with this campaign/order preselected. */
  detailsHref?: string;
};

export function ProducerOrderContextCard({ participation, highlightLotId, compact = false, detailsHref }: Props) {
  const fine =
    participation.campaign.pricing?.categories.find(c => c.code.toUpperCase() === "FINE") ??
    participation.campaign.pricing?.categories[0];
  const window = formatCampaignWindow(participation.campaign.startDate, participation.campaign.endDate);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-lg">{orderLabel(participation)}</CardTitle>
            <CardDescription className="mt-1">
              {participation.campaign.name}
              {participation.campaign.associationName ? ` · ${participation.campaign.associationName}` : null}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill status={participation.orderStatus} />
            {participation.fundsSecured ? (
              <Badge variant="outline" className="border-primary/40 text-primary">
                Fondos asegurados
              </Badge>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
          <span>
            <span className="font-medium text-foreground">{participation.lotCount}</span>{" "}
            {participation.lotCount === 1 ? "lote tuyo" : "lotes tuyos"} en esta orden
          </span>
          {window ? <span>{window}</span> : null}
        </div>

        {fine ? (
          <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
            <p className="m-0 font-medium text-foreground">
              {fine.label} ({fine.code})
            </p>
            <p className="m-0 text-muted-foreground">
              {formatPen(fine.pricePenMinorPerKg)} / kg
              {Number(fine.qualityBonusPenMinorPerKg) > 0
                ? ` + prima ${formatPen(fine.qualityBonusPenMinorPerKg)} / kg`
                : null}
            </p>
          </div>
        ) : null}

        {!compact ? (
          <div className="flex flex-col divide-y divide-border rounded-lg border">
            {participation.lots.map(lot => (
              <div
                key={lot.id}
                className={`flex items-center justify-between gap-3 px-3 py-2.5 text-sm ${
                  lot.id === highlightLotId ? "bg-muted/50" : ""
                }`}
              >
                <Link href={`/producer/lots/${lot.id}`} className="font-medium hover:text-primary hover:underline">
                  Lote {lot.id.slice(0, 8)}
                </Link>
                <StatusPill status={lot.status} />
              </div>
            ))}
          </div>
        ) : null}

        {detailsHref ? (
          <Button asChild variant="outline" size="sm" className="w-fit">
            <Link href={detailsHref}>
              Más detalles
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
