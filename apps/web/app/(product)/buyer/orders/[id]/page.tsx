"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Scale, ShoppingBag, Wallet } from "lucide-react";
import { ErrorBanner, RequireAuth, Skeleton, StatusPill } from "~~/components/alpacto";
import { apiFetch } from "~~/lib/api";
import { formatEscrowUsd, formatKg, formatUsdCents } from "~~/lib/format";
import type { Campaign, Lot, Order } from "~~/lib/types";
import { Badge } from "~~/components/ui/badge";
import { Button } from "~~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~~/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~~/components/ui/table";
import { cn } from "~~/lib/utils";

type FundingStatus = {
  orderId: string;
  orderStatus: string;
  fundedUsdcUnits: string;
  remainingUsdcUnits: string;
  intent: { status: string } | null;
};

type PricingPolicy = {
  id: string;
  categories: Array<{
    code: string;
    label: string;
    pricePenMinorPerKg: string;
    qualityBonusPenMinorPerKg: string;
  }>;
};

function shortId(id: string) {
  return id.slice(0, 8);
}

function progressPercent(funded: string, remaining: string): number {
  const f = Number(funded);
  const r = Number(remaining);
  const total = f + r;
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.round((f / total) * 100);
}

function BuyerOrderInner() {
  const params = useParams();
  const id = String(params.id);
  const [order, setOrder] = useState<Order | null>(null);
  const [lots, setLots] = useState<Lot[]>([]);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [policy, setPolicy] = useState<PricingPolicy | null>(null);
  const [funding, setFunding] = useState<FundingStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError("");
    try {
      const o = await apiFetch<Order>(`/orders/${id}`);
      setOrder(o);
      const [lotsRes, status] = await Promise.all([
        apiFetch<{ lots: Lot[] }>(`/lots?orderId=${id}`),
        apiFetch<FundingStatus>(`/orders/${id}/funding-status`),
      ]);
      setLots(lotsRes.lots);
      setFunding(status);

      try {
        const c = await apiFetch<Campaign>(`/campaigns/${o.campaignId}`);
        setCampaign(c);
        const p = await apiFetch<PricingPolicy>(`/pricing-policies/${c.pricingPolicyId}`);
        setPolicy(p);
      } catch {
        setCampaign(null);
        setPolicy(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la orden");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!order) return;
    if (!["payment_pending", "funding"].includes(order.status) && funding?.intent?.status !== "pending") {
      return;
    }
    const t = setInterval(() => {
      void load();
    }, 4000);
    return () => clearInterval(t);
  }, [order, funding?.intent?.status, load]);

  const fund = async () => {
    setBusy(true);
    setError("");
    try {
      const session = await apiFetch<{ url: string | null }>(`/orders/${id}/funding-session`, {
        method: "POST",
        body: {},
      });
      if (session.url) {
        window.open(session.url, "_blank", "noopener,noreferrer");
      } else {
        setError("Sesión de pago creada, pero sin URL (revisa Stripe).");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar el fondeo");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Skeleton rows={6} />;
  if (!order) return <ErrorBanner message={error || "Orden no encontrada"} />;

  const funded = funding?.fundedUsdcUnits ?? order.fundedUsdcUnits;
  const remaining = funding?.remainingUsdcUnits ?? order.remainingUsdcUnits;
  const percent = progressPercent(funded, remaining);
  const canFund = ["draft", "payment_pending", "funding_failed"].includes(order.status);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <Link
            href="/buyer/orders"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Órdenes
          </Link>
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
              {order.externalRef ?? `Orden ${shortId(order.id)}`}
            </h1>
            {campaign ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Campaña:{" "}
                <Link href={`/buyer/campaigns`} className="text-foreground underline-offset-4 hover:underline">
                  {campaign.name}
                </Link>
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <StatusPill status={funding?.orderStatus ?? order.status} />
            {funding?.intent ? (
              <Badge variant="outline" className="gap-1">
                Pago: <StatusPill status={funding.intent.status} />
              </Badge>
            ) : null}
          </div>
        </div>
        {canFund ? (
          <Button onClick={() => void fund()} disabled={busy} className="shrink-0">
            {busy ? "Abriendo…" : order.status === "funding_failed" ? "Reintentar fondeo" : "Financiar orden"}
          </Button>
        ) : null}
      </div>

      {error ? <ErrorBanner message={error} onDismiss={() => setError("")} /> : null}

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Presupuesto</CardTitle>
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="font-display text-2xl font-semibold text-foreground">
              {formatUsdCents(order.budgetUsdCents)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Meta de fibra</CardTitle>
            <Scale className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="font-display text-2xl font-semibold text-foreground">
              {order.targetWeightGrams ? formatKg(order.targetWeightGrams) : "—"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Fondeado en escrow</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="font-display text-2xl font-semibold text-foreground">{formatEscrowUsd(funded)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Saldo disponible</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="font-display text-2xl font-semibold text-foreground">{formatEscrowUsd(remaining)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Funding progress */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Progreso de fondeo</CardTitle>
              <CardDescription>
                {formatEscrowUsd(funded)} de {formatUsdCents(order.budgetUsdCents)} en escrow
              </CardDescription>
            </div>
            <span className="text-2xl font-semibold tabular-nums">{percent}%</span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full transition-all", percent === 100 ? "bg-primary" : "bg-chart-1")}
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>Fondeado</span>
            <span>Restante: {formatEscrowUsd(remaining)}</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Pricing policy */}
        {policy ? (
          <Card>
            <CardHeader>
              <CardTitle>Tabla de precios</CardTitle>
              <CardDescription>Base y prima de calidad por categoría</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Categoría</TableHead>
                    <TableHead className="text-right">Base</TableHead>
                    <TableHead className="text-right">Prima</TableHead>
                    <TableHead className="text-right">Total / kg</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {policy.categories.map(cat => {
                    const base = Number(cat.pricePenMinorPerKg) / 100;
                    const bonus = Number(cat.qualityBonusPenMinorPerKg) / 100;
                    return (
                      <TableRow key={cat.code}>
                        <TableCell className="font-medium">
                          {cat.label} <span className="text-muted-foreground">({cat.code})</span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">S/ {base.toFixed(2)}</TableCell>
                        <TableCell className="text-right tabular-nums">S/ {bonus.toFixed(2)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          S/ {(base + bonus).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : null}

        {/* Lots */}
        <Card className={cn(!policy && "lg:col-span-2")}>
          <CardHeader>
            <CardTitle>Lotes vinculados</CardTitle>
            <CardDescription>
              {lots.length} {lots.length === 1 ? "lote" : "lotes"} asociado{lots.length === 1 ? "" : "s"} a esta orden
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!lots.length ? (
              <p className="text-sm text-muted-foreground">Sin lotes vinculados.</p>
            ) : (
              <div className="flex flex-col divide-y divide-border">
                {lots.map(lot => (
                  <div key={lot.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                    <span className="font-mono text-sm font-medium">{shortId(lot.id)}</span>
                    <StatusPill status={lot.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function BuyerOrderPage() {
  return (
    <RequireAuth roles={["buyer", "admin"]}>
      <BuyerOrderInner />
    </RequireAuth>
  );
}
