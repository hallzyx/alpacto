"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ErrorBanner, RequireAuth, Skeleton, StatusPill } from "~~/components/alpacto";
import { Button } from "~~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~~/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "~~/components/ui/chart";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Pie, PieChart, XAxis, YAxis } from "recharts";
import { apiFetch } from "~~/lib/api";
import { formatEscrowUsd, formatKg, formatUsdCents, shortTxHash, statusLabel } from "~~/lib/format";
import type { Campaign, Order } from "~~/lib/types";

function BuyerOverviewInner() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [c, o] = await Promise.all([
        apiFetch<{ campaigns: Campaign[] }>("/campaigns"),
        apiFetch<{ orders: Order[] }>("/orders"),
      ]);
      setCampaigns(c.campaigns);
      setOrders(o.orders);
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

  // --- KPI ---
  const activeCampaigns = campaigns.filter(c => c.status === "active").length;
  const fundedOrders = orders.filter(o => ["funded", "accepting_lots", "partially_settled"].includes(o.status)).length;
  const totalBudgetCents = useMemo(() => orders.reduce((sum, o) => sum + Number(o.budgetUsdCents ?? 0), 0), [orders]);
  const totalKgCommitted = useMemo(
    () => orders.reduce((sum, o) => sum + Number(o.targetWeightGrams ?? 0) / 1000, 0),
    [orders],
  );

  // --- Pie: orders by status ---
  const ordersByStatus = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of orders) map.set(o.status, (map.get(o.status) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [orders]);

  const pieChartData = useMemo(
    () =>
      ordersByStatus.map(([status, count]) => ({
        status,
        count,
        label: statusLabel(status),
        fill: `var(--color-${status})`,
      })),
    [ordersByStatus],
  );

  const pieChartConfig = useMemo(() => {
    const colors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
    const config: ChartConfig = {};
    ordersByStatus.forEach(([status], i) => {
      config[status] = { label: statusLabel(status), color: colors[i % colors.length] };
    });
    return config;
  }, [ordersByStatus]);

  // --- Bar: budget by campaign (top 6) ---
  const budgetByCampaign = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of orders) {
      const cents = Number(o.budgetUsdCents ?? 0);
      map.set(o.campaignId, (map.get(o.campaignId) ?? 0) + cents);
    }
    const campaignMap = new Map(campaigns.map(c => [c.id, c.name]));
    return [...map.entries()]
      .map(([campaignId, cents]) => ({
        campaignId,
        name: campaignMap.get(campaignId) ?? campaignId.slice(0, 6),
        usd: Math.round(cents / 100),
      }))
      .sort((a, b) => b.usd - a.usd)
      .slice(0, 6);
  }, [orders, campaigns]);

  const barChartConfig = useMemo(
    () =>
      ({
        usd: { label: "Presupuesto (USD)", color: "var(--chart-1)" },
      }) satisfies ChartConfig,
    [],
  );

  const formatDay = (iso: string | null | undefined) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("es-PE", { month: "short", day: "numeric" });
  };

  if (loading) return <Skeleton rows={6} />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">Comprador</h1>
          <p className="text-muted-foreground">Resumen de campañas, órdenes y fondeo.</p>
        </div>
        <Button asChild>
          <Link href="/buyer/orders/new">Nueva orden</Link>
        </Button>
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
            <CardTitle className="text-sm font-medium text-muted-foreground">Órdenes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-3xl font-semibold text-primary">{orders.length}</p>
            <p className="text-xs text-muted-foreground">{fundedOrders} fondeadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Presupuesto total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-3xl font-semibold text-primary">{formatUsdCents(totalBudgetCents)}</p>
            <p className="text-xs text-muted-foreground">en escrow</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Kg comprometidos</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-3xl font-semibold text-primary">
              {totalKgCommitted.toLocaleString("es-PE", { maximumFractionDigits: 1 })} kg
            </p>
            <p className="text-xs text-muted-foreground">meta de fibra</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts row: bar 3 / pie 1 */}
      <div className="grid gap-4 lg:grid-cols-4">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Presupuesto por campaña</CardTitle>
            <CardDescription>USD comprometidos en escrow por marco comercial.</CardDescription>
          </CardHeader>
          <CardContent>
            {!budgetByCampaign.length ? (
              <p className="text-sm text-muted-foreground">Sin órdenes registradas.</p>
            ) : (
              <ChartContainer config={barChartConfig} className="aspect-auto h-[240px] w-full">
                <BarChart data={budgetByCampaign} margin={{ top: 44, right: 12, left: 4, bottom: 8 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} />
                  <YAxis tickLine={false} axisLine={false} tickMargin={4} width={48} />
                  <ChartTooltip
                    content={<ChartTooltipContent formatter={v => [`$${Number(v).toLocaleString()}`, ""]} />}
                  />
                  <Bar dataKey="usd" fill="var(--color-usd)" radius={[4, 4, 0, 0]}>
                    <LabelList
                      dataKey="usd"
                      position="top"
                      offset={10}
                      formatter={(v: React.ReactNode) => (Number(v) > 0 ? `$${Number(v).toLocaleString()}` : "")}
                      className="fill-foreground text-xs"
                    />
                  </Bar>
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Estados de órdenes</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            {!pieChartData.length ? (
              <p className="text-sm text-muted-foreground">Sin órdenes</p>
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
                  {ordersByStatus.map(([status, count]) => (
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
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {campaigns.find(c => c.id === o.campaignId)?.name ?? "—"}
                      </td>
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

export default function BuyerPage() {
  return (
    <RequireAuth roles={["buyer", "admin"]}>
      <BuyerOverviewInner />
    </RequireAuth>
  );
}
