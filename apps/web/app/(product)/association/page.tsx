"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ErrorBanner, RequireAuth, Skeleton, StatusPill } from "~~/components/alpacto";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~~/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "~~/components/ui/chart";
import { Bar, BarChart, CartesianGrid, LabelList, Pie, PieChart, XAxis, YAxis } from "recharts";
import { apiFetch } from "~~/lib/api";
import { formatEscrowUsd, formatKg, formatUsdCents, shortTxHash, statusLabel } from "~~/lib/format";
import type { Campaign, Lot, Order } from "~~/lib/types";

type Inspection = {
  lotId: string;
  weightGrams: string;
  categoryCode: string;
  submittedAt: string;
};

function startOfWeekMonday(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = domingo, 1 = lunes, …
  const daysFromMonday = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - daysFromMonday);
  return d;
}

function formatWeekRange(weekStart: Date) {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("es-PE", { month: "short", day: "numeric" });
  if (weekStart.getMonth() === end.getMonth()) {
    const month = weekStart.toLocaleDateString("es-PE", { month: "short" });
    return `${weekStart.getDate()} - ${end.getDate()} ${month}`;
  }
  return `${fmt(weekStart)} - ${fmt(end)}`;
}

function AssociationOverviewInner() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [c, o, l] = await Promise.all([
        apiFetch<{ campaigns: Campaign[] }>("/campaigns"),
        apiFetch<{ orders: Order[] }>("/orders"),
        apiFetch<{ lots: Lot[] }>("/lots"),
      ]);
      setCampaigns(c.campaigns);
      setOrders(o.orders);
      setLots(l.lots);

      const inspResults = await Promise.allSettled(
        l.lots.map(lot => apiFetch<{ inspections: Inspection[] }>(`/lots/${lot.id}/inspections`)),
      );
      const all: Inspection[] = [];
      for (const r of inspResults) {
        if (r.status === "fulfilled") all.push(...r.value.inspections);
      }
      setInspections(all);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const latestInspectionByLot = useMemo(() => {
    const map = new Map<string, Inspection>();
    for (const insp of inspections) {
      const existing = map.get(insp.lotId);
      if (!existing || insp.submittedAt > existing.submittedAt) map.set(insp.lotId, insp);
    }
    return map;
  }, [inspections]);

  // --- Pie: lots by status ---
  const lotsByStatus = useMemo(() => {
    const map = new Map<string, number>();
    for (const lot of lots) map.set(lot.status, (map.get(lot.status) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [lots]);

  const pieChartData = useMemo(
    () =>
      lotsByStatus.map(([status, count]) => ({
        status,
        count,
        label: statusLabel(status),
        fill: `var(--color-${status})`,
      })),
    [lotsByStatus],
  );

  const pieChartConfig = useMemo(() => {
    const colors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
    const config: ChartConfig = {};
    lotsByStatus.forEach(([status], i) => {
      config[status] = { label: statusLabel(status), color: colors[i % colors.length] };
    });
    return config;
  }, [lotsByStatus]);

  // --- Bar: weekly inspection activity (always 6 buckets, unlike category in demo V1) ---
  const weeklyActivity = useMemo(() => {
    const weeks = 6;
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const currentWeekStart = startOfWeekMonday(new Date());

    const buckets = Array.from({ length: weeks }, (_, i) => {
      const weekStart = new Date(currentWeekStart);
      weekStart.setDate(weekStart.getDate() - (weeks - 1 - i) * 7);
      const weekEnd = weekStart.getTime() + weekMs;
      return {
        label: formatWeekRange(weekStart),
        weekStart: weekStart.getTime(),
        weekEnd,
        kg: 0,
        lotes: 0,
      };
    });

    for (const insp of inspections) {
      const t = new Date(insp.submittedAt).getTime();
      const bucket = buckets.find(b => t >= b.weekStart && t < b.weekEnd);
      if (bucket) bucket.kg += Number(insp.weightGrams) / 1000;
    }

    for (const lot of lots) {
      const t = new Date(lot.createdAt).getTime();
      const bucket = buckets.find(b => t >= b.weekStart && t < b.weekEnd);
      if (bucket) bucket.lotes += 1;
    }

    return buckets.map(b => ({
      label: b.label,
      kg: Math.round(b.kg * 10) / 10,
      lotes: b.lotes,
    }));
  }, [inspections, lots]);

  const barChartData = weeklyActivity;

  const barChartConfig = useMemo(
    () =>
      ({
        kg: { label: "Kg inspeccionados", color: "var(--chart-1)" },
        lotes: { label: "Lotes registrados", color: "var(--chart-2)" },
      }) satisfies ChartConfig,
    [],
  );

  const campaignMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of campaigns) map.set(c.id, c.name);
    return map;
  }, [campaigns]);

  const formatDay = (iso: string | null | undefined) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("es-PE", { month: "short", day: "numeric" });
  };

  const activeCampaigns = campaigns.filter(c => c.status === "active").length;
  const fundedOrders = orders.filter(o => o.status === "funded").length;
  const totalKgInspected = useMemo(() => weeklyActivity.reduce((s, row) => s + row.kg, 0), [weeklyActivity]);

  if (loading) return <Skeleton rows={6} />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">Asociación</h1>
        <p className="text-muted-foreground">Resumen de campañas, órdenes y lotes.</p>
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Campañas activas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-3xl font-semibold text-primary">{activeCampaigns}</p>
            <p className="text-xs text-muted-foreground">de {campaigns.length} totales</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Órdenes fondeadas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-3xl font-semibold text-primary">{fundedOrders}</p>
            <p className="text-xs text-muted-foreground">de {orders.length} totales</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Lotes registrados</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-3xl font-semibold text-primary">{lots.length}</p>
            <p className="text-xs text-muted-foreground">en el sistema</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Kg inspeccionados</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-3xl font-semibold text-primary">
              {totalKgInspected.toLocaleString("es-PE", { maximumFractionDigits: 1 })} kg
            </p>
            <p className="text-xs text-muted-foreground">en {latestInspectionByLot.size} lotes</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts row: bar 3 / pie 1 */}
      <div className="grid gap-4 lg:grid-cols-4">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Actividad semanal</CardTitle>
            <CardDescription>Kg inspeccionados y lotes registrados en las últimas 6 semanas.</CardDescription>
          </CardHeader>
          <CardContent>
            {!inspections.length && !lots.length ? (
              <p className="text-sm text-muted-foreground">Sin actividad registrada.</p>
            ) : (
              <ChartContainer config={barChartConfig} className="aspect-auto h-[240px] w-full">
                <BarChart data={barChartData} margin={{ top: 44, right: 12, left: 4, bottom: 8 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    interval={0}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis yAxisId="kg" tickLine={false} axisLine={false} tickMargin={4} width={40} />
                  <YAxis
                    yAxisId="lotes"
                    orientation="right"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={4}
                    width={28}
                    allowDecimals={false}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar yAxisId="kg" dataKey="kg" fill="var(--color-kg)" radius={[4, 4, 0, 0]}>
                    <LabelList
                      dataKey="kg"
                      position="top"
                      offset={10}
                      formatter={(v: React.ReactNode) => (Number(v) > 0 ? `${v}\u00A0kg` : "")}
                      className="fill-foreground text-xs"
                    />
                  </Bar>
                  <Bar yAxisId="lotes" dataKey="lotes" fill="var(--color-lotes)" radius={[4, 4, 0, 0]} />
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
                <ChartContainer config={pieChartConfig} className="mx-auto aspect-square h-[140px]">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Pie
                      data={pieChartData}
                      dataKey="count"
                      nameKey="label"
                      innerRadius={42}
                      outerRadius={62}
                      paddingAngle={2}
                    />
                  </PieChart>
                </ChartContainer>
                <div className="grid w-full gap-1.5">
                  {lotsByStatus.map(([status, count]) => (
                    <div key={status} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="size-2 rounded-full" style={{ backgroundColor: `var(--color-${status})` }} />
                        <StatusPill status={status} />
                      </div>
                      <span className="font-medium">{count}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Orders table — full width */}
      <Card>
        <CardHeader>
          <CardTitle>Últimas órdenes</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!orders.length ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">Sin órdenes.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Referencia</th>
                    <th className="px-4 py-2 font-medium">Campaña</th>
                    <th className="px-4 py-2 font-medium">Meta kg</th>
                    <th className="px-4 py-2 font-medium">Presupuesto</th>
                    <th className="px-4 py-2 font-medium">Restante</th>
                    <th className="px-4 py-2 font-medium">Estado</th>
                    <th className="px-4 py-2 font-medium">Fecha</th>
                    <th className="px-4 py-2 font-medium">Tx</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.slice(0, 8).map(o => (
                    <tr key={o.id} className="border-b border-border/60 last:border-0 hover:bg-muted/50">
                      <td className="px-4 py-2.5 font-medium">
                        <Link href={`/buyer/orders/${o.id}`} className="hover:text-primary hover:underline">
                          {o.externalRef ?? o.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{campaignMap.get(o.campaignId) ?? "—"}</td>
                      <td className="px-4 py-2.5">{formatKg(o.targetWeightGrams)}</td>
                      <td className="px-4 py-2.5">{formatUsdCents(o.budgetUsdCents)}</td>
                      <td className="px-4 py-2.5">{formatEscrowUsd(o.remainingUsdcUnits)}</td>
                      <td className="px-4 py-2.5">
                        <StatusPill status={o.status} />
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{formatDay(o.createdAt)}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{shortTxHash(o.txHash)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AssociationPage() {
  return (
    <RequireAuth roles={["association", "admin"]}>
      <AssociationOverviewInner />
    </RequireAuth>
  );
}
