"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  EmptyState,
  ErrorBanner,
  ProducerGuideLink,
  ProducerOrderContextCard,
  RequireAuth,
  Skeleton,
  StatusPill,
} from "~~/components/alpacto";
import { apiFetch } from "~~/lib/api";
import { formatKg, formatPen, orderDisplayRef } from "~~/lib/format";
import type { Lot, ProducerOrderParticipation, ProducerParticipation, SettlementPreview } from "~~/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~~/components/ui/card";
import { Field, FieldLabel } from "~~/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~~/components/ui/select";

function shortLotId(id: string) {
  return `Lote ${id.slice(0, 8)}`;
}

/** Most recently registered lot across all orders. */
function findLatestLotOrder(orders: ProducerOrderParticipation[]): {
  campaignId: string;
  orderId: string;
} | null {
  let latest: Lot | null = null;
  let latestOrder: ProducerOrderParticipation | null = null;
  for (const order of orders) {
    for (const lot of order.lots) {
      if (!latest || new Date(lot.createdAt) > new Date(latest.createdAt)) {
        latest = lot;
        latestOrder = order;
      }
    }
  }
  if (!latestOrder) return null;
  return { campaignId: latestOrder.campaign.id, orderId: latestOrder.orderId };
}

function ProducerLotsInner() {
  const searchParams = useSearchParams();
  const queryCampaignId = searchParams.get("campaignId") ?? "";
  const queryOrderId = searchParams.get("orderId") ?? "";

  const [participation, setParticipation] = useState<ProducerParticipation | null>(null);
  const [estimates, setEstimates] = useState<Record<string, SettlementPreview>>({});
  const [campaignId, setCampaignId] = useState("");
  const [orderId, setOrderId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const campaigns = useMemo(() => {
    if (!participation) return [];
    const map = new Map<string, { id: string; name: string; associationName: string | null }>();
    for (const order of participation.orders) {
      if (!map.has(order.campaign.id)) {
        map.set(order.campaign.id, {
          id: order.campaign.id,
          name: order.campaign.name,
          associationName: order.campaign.associationName,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [participation]);

  const ordersInCampaign = useMemo(() => {
    if (!participation || !campaignId) return [];
    return participation.orders.filter(o => o.campaign.id === campaignId);
  }, [participation, campaignId]);

  const selectedOrder = useMemo(() => {
    return ordersInCampaign.find(o => o.orderId === orderId) ?? null;
  }, [ordersInCampaign, orderId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const data = await apiFetch<ProducerParticipation>("/producer/participation");
        if (cancelled) return;
        setParticipation(data);

        const fromQuery =
          queryCampaignId && data.orders.some(o => o.campaign.id === queryCampaignId)
            ? {
                campaignId: queryCampaignId,
                orderId:
                  queryOrderId && data.orders.some(o => o.orderId === queryOrderId && o.campaign.id === queryCampaignId)
                    ? queryOrderId
                    : (() => {
                        const inCampaign = data.orders.filter(o => o.campaign.id === queryCampaignId);
                        let best: ProducerOrderParticipation | null = null;
                        let bestDate = 0;
                        for (const order of inCampaign) {
                          for (const lot of order.lots) {
                            const t = new Date(lot.createdAt).getTime();
                            if (t >= bestDate) {
                              bestDate = t;
                              best = order;
                            }
                          }
                        }
                        return best?.orderId ?? inCampaign[0]?.orderId ?? "";
                      })(),
              }
            : null;

        const defaults = fromQuery ?? findLatestLotOrder(data.orders);
        if (defaults) {
          setCampaignId(defaults.campaignId);
          setOrderId(defaults.orderId);
        }

        const next: Record<string, SettlementPreview> = {};
        await Promise.all(
          data.orders
            .flatMap(o => o.lots)
            .map(async lot => {
              if (lot.currentInspectionVersion < 1) return;
              try {
                const preview = await apiFetch<SettlementPreview>(`/lots/${lot.id}/settlement-preview`);
                next[lot.id] = preview;
              } catch {
                /* preview unavailable */
              }
            }),
        );
        if (!cancelled) setEstimates(next);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "No se pudieron cargar los lotes");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [queryCampaignId, queryOrderId]);

  const onCampaignChange = (nextCampaignId: string) => {
    setCampaignId(nextCampaignId);
    if (!participation) return;
    const inCampaign = participation.orders.filter(o => o.campaign.id === nextCampaignId);
    // Prefer order with the newest lot in that campaign
    let best: ProducerOrderParticipation | null = null;
    let bestDate = 0;
    for (const order of inCampaign) {
      for (const lot of order.lots) {
        const t = new Date(lot.createdAt).getTime();
        if (t >= bestDate) {
          bestDate = t;
          best = order;
        }
      }
    }
    setOrderId(best?.orderId ?? inCampaign[0]?.orderId ?? "");
  };

  if (loading) return <Skeleton rows={6} />;

  const totalLots = participation?.totalLots ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">Mis lotes</h1>
          <p className="text-muted-foreground">
            Elige campaña y orden para ver tus lotes. Por defecto: el último lote registrado.
          </p>
        </div>
        <ProducerGuideLink />
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      {!totalLots ? (
        <EmptyState title="Aún no hay lotes" description="Cuando la asociación registre tu fibra, aparecerá aquí." />
      ) : (
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Buscar por campaña y orden</CardTitle>
              <CardDescription>Primero la campaña, luego la orden comercial.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="producer-campaign">Campaña</FieldLabel>
                  <Select value={campaignId} onValueChange={onCampaignChange}>
                    <SelectTrigger id="producer-campaign" className="w-full">
                      <SelectValue placeholder="Elige una campaña" />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {campaigns.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                          {c.associationName ? ` · ${c.associationName}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field>
                  <FieldLabel htmlFor="producer-order">Orden</FieldLabel>
                  <Select value={orderId} onValueChange={setOrderId} disabled={!campaignId || !ordersInCampaign.length}>
                    <SelectTrigger id="producer-order" className="w-full">
                      <SelectValue placeholder="Elige una orden" />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {ordersInCampaign.map(o => (
                        <SelectItem key={o.orderId} value={o.orderId}>
                          {orderDisplayRef(o.externalRef, o.orderId)} · {o.lotCount}{" "}
                          {o.lotCount === 1 ? "lote" : "lotes"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </CardContent>
          </Card>

          {selectedOrder ? (
            <>
              <ProducerOrderContextCard participation={selectedOrder} compact />

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Detalle por lote</CardTitle>
                  <CardDescription>
                    {selectedOrder.lotCount} {selectedOrder.lotCount === 1 ? "lote" : "lotes"} en{" "}
                    {orderDisplayRef(selectedOrder.externalRef, selectedOrder.orderId)} · peso e estimado neto en soles
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="px-4 py-2.5 font-medium">Lote</th>
                          <th className="px-4 py-2.5 font-medium">Estado</th>
                          <th className="px-4 py-2.5 font-medium text-right">Peso</th>
                          <th className="px-4 py-2.5 font-medium text-right">Estimado</th>
                          <th className="px-4 py-2.5 font-medium text-right">Fecha</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...selectedOrder.lots]
                          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                          .map(lot => {
                            const est = estimates[lot.id];
                            return (
                              <tr key={lot.id} className="border-b last:border-0 hover:bg-muted/50">
                                <td className="px-4 py-2.5">
                                  <Link
                                    href={`/producer/lots/${lot.id}`}
                                    className="font-medium hover:text-primary hover:underline"
                                  >
                                    {shortLotId(lot.id)}
                                  </Link>
                                </td>
                                <td className="px-4 py-2.5">
                                  <StatusPill status={lot.status} />
                                </td>
                                <td className="px-4 py-2.5 text-right text-muted-foreground">
                                  {est ? formatKg(est.weightGrams) : "—"}
                                </td>
                                <td className="px-4 py-2.5 text-right font-medium">
                                  {est ? formatPen(est.netPenMinor) : "—"}
                                </td>
                                <td className="px-4 py-2.5 text-right text-muted-foreground">
                                  {new Date(lot.createdAt).toLocaleDateString("es-PE", {
                                    month: "short",
                                    day: "numeric",
                                  })}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <EmptyState title="Elige una orden" description="Selecciona campaña y orden arriba para ver tus lotes." />
          )}
        </div>
      )}
    </div>
  );
}

export default function ProducerLotsPage() {
  return (
    <RequireAuth roles="producer">
      <Suspense fallback={<Skeleton rows={6} />}>
        <ProducerLotsInner />
      </Suspense>
    </RequireAuth>
  );
}
