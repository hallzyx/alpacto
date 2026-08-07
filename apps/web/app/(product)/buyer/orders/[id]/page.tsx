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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~~/components/ui/dialog";
import { Input } from "~~/components/ui/input";
import { Label } from "~~/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~~/components/ui/table";
import { cn } from "~~/lib/utils";

type FundingStatus = {
  orderId: string;
  orderStatus: string;
  fundedUsdcUnits: string;
  remainingUsdcUnits: string;
  targetWeightGrams?: string | null;
  reservedWeightGrams?: string | null;
  fulfilledWeightGrams?: string | null;
  onchainRemainingUsdcUnits?: string | null;
  canWithdrawRemainder?: boolean;
  fundingPasswordRequired?: boolean;
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

function progressPercent(fundedUsdcUnits: string, budgetUsdCents: string): number {
  const funded = Number(fundedUsdcUnits);
  // budget is USD cents; USDC uses 6 decimals → 1 cent = 10_000 units
  const budgetUsdc = Number(budgetUsdCents) * 10_000;
  if (!Number.isFinite(funded) || !Number.isFinite(budgetUsdc) || budgetUsdc <= 0) return 0;
  return Math.min(100, Math.round((funded / budgetUsdc) * 100));
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
  const [fundModalOpen, setFundModalOpen] = useState(false);
  const [fundPassword, setFundPassword] = useState("");
  const [fundModalError, setFundModalError] = useState("");

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

  const startFundingSession = async (opts?: { confirmPassword?: string; fromModal?: boolean }) => {
    setBusy(true);
    setError("");
    setFundModalError("");
    try {
      const session = await apiFetch<{ url: string | null }>(`/orders/${id}/funding-session`, {
        method: "POST",
        body: opts?.confirmPassword ? { confirmPassword: opts.confirmPassword } : {},
      });
      if (session.url) {
        window.open(session.url, "_blank", "noopener,noreferrer");
      } else {
        setError("Sesión de pago creada, pero sin URL (revisa Stripe).");
      }
      setFundModalOpen(false);
      setFundPassword("");
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo iniciar el depósito de fondos";
      if (opts?.fromModal) {
        setFundModalError(message);
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  };

  const onFundClick = () => {
    setError("");
    setFundModalError("");
    if (funding?.fundingPasswordRequired) {
      setFundPassword("");
      setFundModalOpen(true);
      return;
    }
    void startFundingSession();
  };

  const confirmFundWithPassword = () => {
    if (!fundPassword.trim()) {
      setFundModalError("Ingresa la clave de confirmación del demo.");
      return;
    }
    void startFundingSession({ confirmPassword: fundPassword.trim(), fromModal: true });
  };

  const withdrawRemainder = async () => {
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/orders/${id}/withdraw-remainder`, {
        method: "POST",
        body: {},
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo retirar el remanente");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Skeleton rows={6} />;
  if (!order) return <ErrorBanner message={error || "Orden no encontrada"} />;

  const funded = funding?.fundedUsdcUnits ?? order.fundedUsdcUnits;
  const remaining = funding?.remainingUsdcUnits ?? order.remainingUsdcUnits;
  const percent = progressPercent(funded, order.budgetUsdCents);
  const canFund = ["draft", "payment_pending", "funding_failed"].includes(order.status);
  const targetGrams = funding?.targetWeightGrams ?? order.targetWeightGrams ?? null;
  const reservedGrams = funding?.reservedWeightGrams ?? null;
  const fulfilledGrams = funding?.fulfilledWeightGrams ?? null;
  const canWithdraw = Boolean(funding?.canWithdrawRemainder);
  const weightProgress =
    targetGrams && Number(targetGrams) > 0 && fulfilledGrams != null
      ? Math.min(100, Math.round((Number(fulfilledGrams) / Number(targetGrams)) * 100))
      : null;

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
        {canFund || canWithdraw ? (
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            {canFund ? (
              <Button onClick={onFundClick} disabled={busy}>
                {busy ? "Abriendo…" : order.status === "funding_failed" ? "Reintentar depósito" : "Financiar orden"}
              </Button>
            ) : null}
            {canWithdraw ? (
              <Button onClick={() => void withdrawRemainder()} disabled={busy} variant="secondary">
                {busy ? "Retirando…" : "Retirar remanente"}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {error ? <ErrorBanner message={error} onDismiss={() => setError("")} /> : null}

      <Dialog
        open={fundModalOpen}
        onOpenChange={open => {
          setFundModalOpen(open);
          if (!open) {
            setFundPassword("");
            setFundModalError("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar depósito (demo público)</DialogTitle>
            <DialogDescription>
              Este entorno es público. El depósito mueve USDC de prueba del comprador demo hacia el escrow on-chain.
              Pedimos una clave para que un visitante curioso no vacíe el saldo del demo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="demo-funding-password">Clave de confirmación</Label>
            <Input
              id="demo-funding-password"
              type="password"
              autoComplete="off"
              autoFocus
              placeholder="Clave del demo"
              value={fundPassword}
              disabled={busy}
              onChange={e => setFundPassword(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirmFundWithPassword();
                }
              }}
            />
            {fundModalError ? <p className="text-sm text-destructive">{fundModalError}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setFundModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={busy || !fundPassword.trim()} onClick={confirmFundWithPassword}>
              {busy ? "Abriendo Stripe…" : "Continuar a Stripe"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              {targetGrams ? formatKg(targetGrams) : "—"}
            </p>
            {fulfilledGrams != null || reservedGrams != null ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Cumplido {fulfilledGrams != null ? formatKg(fulfilledGrams) : "—"}
                {reservedGrams != null ? ` · reservado ${formatKg(reservedGrams)}` : null}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Reservado en garantía</CardTitle>
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
              <CardTitle>Progreso del depósito</CardTitle>
              <CardDescription>
                {formatEscrowUsd(funded)} de {formatUsdCents(order.budgetUsdCents)} en cuenta de garantía
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
            <span>Reservado vs presupuesto</span>
            <span>Disponible en cuenta de garantía: {formatEscrowUsd(remaining)}</span>
          </div>
        </CardContent>
      </Card>

      {weightProgress != null ? (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Progreso de acopio</CardTitle>
                <CardDescription>
                  {formatKg(fulfilledGrams!)} cumplidos de {formatKg(targetGrams!)}
                  {reservedGrams != null && Number(reservedGrams) > 0
                    ? ` · ${formatKg(reservedGrams)} en reserva`
                    : null}
                </CardDescription>
              </div>
              <span className="text-2xl font-semibold tabular-nums">{weightProgress}%</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  weightProgress >= 100 ? "bg-primary" : "bg-chart-2",
                )}
                style={{ width: `${weightProgress}%` }}
              />
            </div>
            {canWithdraw ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Meta alcanzada y sin reservas — puedes retirar el remanente en dólares de la cuenta de garantía.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

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
