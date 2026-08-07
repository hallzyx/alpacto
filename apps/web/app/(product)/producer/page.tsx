"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, DollarSign, Package, Scale } from "lucide-react";
import {
  EmptyState,
  ErrorBanner,
  ProducerGuideLink,
  ProducerOrderContextCard,
  ProducerSessionKeyGrant,
  RequireAuth,
  Skeleton,
  StatusPill,
} from "~~/components/alpacto";
import { apiFetch } from "~~/lib/api";
import { formatKg, formatPen, orderDisplayRef } from "~~/lib/format";
import type { ProducerParticipation, SettlementPreview } from "~~/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~~/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "~~/components/ui/chart";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Pie, PieChart, XAxis, YAxis } from "recharts";

function shortLotId(id: string) {
  return `Lote ${id.slice(0, 8)}`;
}

function ProducerDashboardInner() {
  const [participation, setParticipation] = useState<ProducerParticipation | null>(null);
  const [estimates, setEstimates] = useState<Record<string, SettlementPreview>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const lots = useMemo(() => participation?.orders.flatMap(o => o.lots) ?? [], [participation]);

  const orderRefByLotId = useMemo(() => {
    const map = new Map<string, string>();
    for (const order of participation?.orders ?? []) {
      const label = orderDisplayRef(order.externalRef, order.orderId);
      for (const lot of order.lots) map.set(lot.id, label);
    }
    return map;
  }, [participation]);

  /** Up to 2 campaigns with newest lot activity; one order card per campaign. */
  const recentCampaignOrders = useMemo(() => {
    const orders = participation?.orders ?? [];
    const byCampaign = new Map<string, { latestLotAt: number; order: (typeof orders)[number] }>();
    for (const order of orders) {
      for (const lot of order.lots) {
        const t = new Date(lot.createdAt).getTime();
        const prev = byCampaign.get(order.campaign.id);
        if (!prev || t > prev.latestLotAt) {
          byCampaign.set(order.campaign.id, { latestLotAt: t, order });
        }
      }
    }
    return Array.from(byCampaign.values())
      .sort((a, b) => b.latestLotAt - a.latestLotAt)
      .slice(0, 2)
      .map(entry => entry.order);
  }, [participation]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const data = await apiFetch<ProducerParticipation>("/producer/participation");
        if (cancelled) return;
        setParticipation(data);

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
  }, []);

  const lotsByStatus = useMemo(() => {
    const map = new Map<string, number>();
    for (const lot of lots) {
      map.set(lot.status, (map.get(lot.status) ?? 0) + 1);
    }
    return map;
  }, [lots]);

  const pieChartData = useMemo(() => {
    return Array.from(lotsByStatus.entries()).map(([status, count]) => ({
      name: status,
      value: count,
    }));
  }, [lotsByStatus]);

  const pieChartConfig = useMemo(() => {
    const colors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
    const cfg: ChartConfig = {};
    Array.from(lotsByStatus.keys()).forEach((status, i) => {
      cfg[status] = { label: status, color: colors[i % colors.length] };
    });
    return cfg;
  }, [lotsByStatus]);

  const earningsByLot = useMemo(() => {
    return lots
      .filter(l => estimates[l.id])
      .map(l => ({
        id: l.id,
        shortId: shortLotId(l.id),
        netPenMinor: Number(estimates[l.id].netPenMinor) / 100,
        grossPenMinor: Number(estimates[l.id].grossPenMinor) / 100,
      }))
      .sort((a, b) => b.netPenMinor - a.netPenMinor);
  }, [lots, estimates]);

  const barChartData = earningsByLot;
  const barChartConfig = useMemo(
    () =>
      ({
        grossPenMinor: { label: "Bruto", color: "var(--chart-3)" },
        netPenMinor: { label: "Neto estimado", color: "var(--chart-1)" },
      }) satisfies ChartConfig,
    [],
  );

  const totalEstimatedPen = useMemo(() => {
    return Object.values(estimates).reduce((sum, e) => sum + Number(e.netPenMinor), 0);
  }, [estimates]);

  const totalKg = useMemo(() => {
    return Object.values(estimates).reduce((sum, e) => sum + Number(e.weightGrams), 0);
  }, [estimates]);

  const settledLots = lots.filter(l => l.status === "settled").length;
  const activeLots = lots.filter(l => !["settled", "closed"].includes(l.status)).length;

  if (loading) return <Skeleton rows={6} />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">Productor</h1>
          <p className="text-muted-foreground">Resumen de tus lotes, estimados y actividad.</p>
        </div>
        <ProducerGuideLink />
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      <ProducerSessionKeyGrant />

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total lotes</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="font-display text-3xl font-semibold text-foreground">{lots.length}</p>
            <p className="text-xs text-muted-foreground">{activeLots} en proceso</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Liquidados</CardTitle>
            <Scale className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="font-display text-3xl font-semibold text-foreground">{settledLots}</p>
            <p className="text-xs text-muted-foreground">
              {lots.length ? Math.round((settledLots / lots.length) * 100) : 0}% del total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Kg estimados</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="font-display text-3xl font-semibold text-foreground">{formatKg(totalKg)}</p>
            <p className="text-xs text-muted-foreground">peso inspeccionado</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Estimado neto</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="font-display text-3xl font-semibold text-foreground">{formatPen(totalEstimatedPen)}</p>
            <p className="text-xs text-muted-foreground">en soles</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-4">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Estimado por lote</CardTitle>
            <CardDescription>Bruto vs neto en soles por lote inspeccionado</CardDescription>
          </CardHeader>
          <CardContent>
            {!barChartData.length ? (
              <p className="text-sm text-muted-foreground">Sin inspecciones registradas.</p>
            ) : (
              <ChartContainer config={barChartConfig} className="aspect-auto h-[240px] w-full">
                <BarChart data={barChartData} margin={{ top: 44, right: 12, left: 4, bottom: 8 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="shortId" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} />
                  <YAxis tickLine={false} axisLine={false} tickMargin={4} width={56} />
                  <ChartTooltip
                    content={<ChartTooltipContent formatter={v => [`S/ ${Number(v).toLocaleString()}`, ""]} />}
                  />
                  <Bar dataKey="grossPenMinor" fill="var(--color-grossPenMinor)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="netPenMinor" fill="var(--color-netPenMinor)" radius={[4, 4, 0, 0]}>
                    <LabelList
                      dataKey="netPenMinor"
                      position="top"
                      offset={10}
                      formatter={(v: React.ReactNode) => (Number(v) > 0 ? `S/ ${Number(v).toLocaleString()}` : "")}
                      className="fill-foreground text-xs"
                    />
                  </Bar>
                  <ChartLegend content={<ChartLegendContent />} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Estados de lotes</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            {!pieChartData.length ? (
              <p className="text-sm text-muted-foreground">Sin lotes</p>
            ) : (
              <>
                <ChartContainer config={pieChartConfig} className="aspect-square h-[180px] w-full">
                  <PieChart>
                    <Pie data={pieChartData} dataKey="value" nameKey="name" innerRadius={44} outerRadius={70}>
                      {pieChartData.map((entry, i) => (
                        <Cell
                          key={entry.name}
                          fill={pieChartConfig[entry.name]?.color ?? `var(--chart-${(i % 5) + 1})`}
                        />
                      ))}
                    </Pie>
                    <ChartTooltip content={<ChartTooltipContent />} />
                  </PieChart>
                </ChartContainer>
                <div className="flex flex-wrap justify-center gap-2">
                  {pieChartData.map((entry, i) => (
                    <div key={entry.name} className="flex items-center gap-1.5 text-xs">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{
                          backgroundColor: pieChartConfig[entry.name]?.color ?? `var(--chart-${(i % 5) + 1})`,
                        }}
                      />
                      <span className="text-muted-foreground capitalize">{entry.name.replace(/_/g, " ")}</span>
                      <span className="font-medium">{entry.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Orders the producer participates in */}
      {recentCampaignOrders.length ? (
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="font-display text-xl font-semibold tracking-tight">Tus órdenes</h2>
            <p className="text-sm text-muted-foreground">Tus 2 campañas más recientes con lotes nuevos.</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {recentCampaignOrders.map(order => (
              <ProducerOrderContextCard
                key={order.orderId}
                participation={order}
                compact
                detailsHref={`/producer/lots?campaignId=${order.campaign.id}&orderId=${order.orderId}`}
              />
            ))}
          </div>
        </div>
      ) : null}

      {/* Recent lots */}
      <Card>
        <CardHeader>
          <CardTitle>Mis lotes</CardTitle>
          <CardDescription>Estado y estimado de cada lote</CardDescription>
        </CardHeader>
        <CardContent>
          {!lots.length ? (
            <EmptyState
              title="Aún no hay lotes"
              description="Cuando la asociación registre tu fibra, aparecerá aquí."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Lote</th>
                    <th className="px-4 py-2.5 font-medium">Orden</th>
                    <th className="px-4 py-2.5 font-medium">Estado</th>
                    <th className="px-4 py-2.5 font-medium text-right">Estimado</th>
                    <th className="px-4 py-2.5 font-medium text-right">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {lots.map(lot => {
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
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {orderRefByLotId.get(lot.id) ?? orderDisplayRef(null, lot.orderId)}
                        </td>
                        <td className="px-4 py-2.5">
                          <StatusPill status={lot.status} />
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium">{est ? formatPen(est.netPenMinor) : "—"}</td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground">
                          {new Date(lot.createdAt).toLocaleDateString("es-PE", { month: "short", day: "numeric" })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function ProducerPage() {
  return (
    <RequireAuth roles="producer">
      <ProducerDashboardInner />
    </RequireAuth>
  );
}
