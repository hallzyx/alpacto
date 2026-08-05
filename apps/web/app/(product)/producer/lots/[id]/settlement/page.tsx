"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, CreditCard, FileText, Wallet } from "lucide-react";
import { ErrorBanner, RequireAuth, Skeleton, StatusPill } from "~~/components/alpacto";
import { apiFetch } from "~~/lib/api";
import { formatKg, formatPen } from "~~/lib/format";
import type { LocalPayout, Settlement, SettlementPreview } from "~~/lib/types";
import { Badge } from "~~/components/ui/badge";
import { Button } from "~~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~~/components/ui/card";

function shortLotId(id: string) {
  return `Lote ${id.slice(0, 8)}`;
}

function SettlementInner() {
  const params = useParams();
  const id = String(params.id);
  const [preview, setPreview] = useState<SettlementPreview | null>(null);
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [payout, setPayout] = useState<LocalPayout | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setPreview(await apiFetch<SettlementPreview>(`/lots/${id}/settlement-preview`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sin vista previa de liquidación");
    }
    try {
      setSettlement(await apiFetch<Settlement>(`/lots/${id}/settlement`));
    } catch {
      setSettlement(null);
    }
    try {
      setPayout(await apiFetch<LocalPayout>(`/lots/${id}/local-payout`));
    } catch {
      setPayout(null);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const accept = async () => {
    setBusy(true);
    setError("");
    try {
      const s = await apiFetch<Settlement>(`/lots/${id}/settlement/accept`, { method: "POST", body: {} });
      setSettlement(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo aceptar la liquidación");
    } finally {
      setBusy(false);
    }
  };

  const simulatePayout = async () => {
    setBusy(true);
    setError("");
    try {
      const p = await apiFetch<LocalPayout>(`/lots/${id}/local-payout/simulate`, { method: "POST", body: {} });
      setPayout(p);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo simular el pago");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Skeleton rows={5} />;

  const amounts = settlement ?? preview;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <Link
          href={`/producer/lots/${id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al lote
        </Link>
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">Liquidación</h1>
          <p className="text-muted-foreground">
            Resumen final en soles para {shortLotId(id)}. Confirmación simple, sin gas ni wallets.
          </p>
        </div>
        {settlement ? (
          <div className="flex items-center gap-2">
            <StatusPill status={settlement.status} />
            {payout ? (
              <Badge variant="outline" className="gap-1">
                Pago local: <StatusPill status={payout.status} />
              </Badge>
            ) : null}
          </div>
        ) : null}
      </div>

      {error ? <ErrorBanner message={error} onDismiss={() => setError("")} /> : null}

      {amounts ? (
        <>
          {/* Summary cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Peso</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="font-display text-2xl font-semibold text-foreground">{formatKg(amounts.weightGrams)}</p>
                <p className="text-xs text-muted-foreground">categoría {amounts.categoryCode}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Bruto</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="font-display text-2xl font-semibold text-foreground">
                  {formatPen(amounts.grossPenMinor)}
                </p>
                <p className="text-xs text-muted-foreground">antes de comisiones</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Prima</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="font-display text-2xl font-semibold text-primary">+ {formatPen(amounts.bonusPenMinor)}</p>
                <p className="text-xs text-muted-foreground">calidad</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Comisiones</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="font-display text-2xl font-semibold text-destructive">
                  − {formatPen(Number(amounts.feePenMinor) + Number(amounts.platformFeePenMinor ?? 0))}
                </p>
                <p className="text-xs text-muted-foreground">asociación + plataforma</p>
              </CardContent>
            </Card>
          </div>

          {/* Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Desglose detallado</CardTitle>
              <CardDescription>Cálculo completo en soles</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <span className="text-muted-foreground">Peso inspeccionado</span>
                  <span className="font-medium">{formatKg(amounts.weightGrams)}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <span className="text-muted-foreground">Categoría</span>
                  <span className="font-medium">{amounts.categoryCode}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <span className="text-muted-foreground">Bruto</span>
                  <span className="font-medium">{formatPen(amounts.grossPenMinor)}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <span className="text-muted-foreground">Prima de calidad</span>
                  <span className="font-medium text-primary">+ {formatPen(amounts.bonusPenMinor)}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <span className="text-muted-foreground">Comisión asociación</span>
                  <span className="font-medium text-destructive">− {formatPen(amounts.feePenMinor)}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <span className="text-muted-foreground">Comisión plataforma</span>
                  <span className="font-medium text-destructive">
                    − {formatPen(amounts.platformFeePenMinor ?? "0")}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between rounded-lg bg-muted p-4">
                  <span className="text-lg font-medium">Total a recibir</span>
                  <span className="text-3xl font-semibold text-primary">{formatPen(amounts.netPenMinor)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}

      {/* Actions */}
      <div className="flex gap-2">
        {!settlement ? (
          <Button onClick={() => void accept()} disabled={busy || !preview} size="lg">
            {busy ? "Confirmando…" : "Aceptar liquidación"}
          </Button>
        ) : (
          <Button onClick={() => void simulatePayout()} disabled={busy || !!payout} size="lg">
            {busy ? "…" : payout ? "Pago simulado" : "Simular pago local"}
          </Button>
        )}
      </div>

      {/* Payout card */}
      {payout ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Pago local</CardTitle>
                <CardDescription>Simulación de transferencia</CardDescription>
              </div>
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Simulación
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1 rounded-lg border p-4">
                <span className="text-sm text-muted-foreground">Monto</span>
                <span className="text-lg font-semibold">{formatPen(payout.amountPenMinor)}</span>
              </div>
              <div className="flex flex-col gap-1 rounded-lg border p-4">
                <span className="text-sm text-muted-foreground">Referencia</span>
                <span className="text-lg font-semibold font-mono">{payout.reference ?? "—"}</span>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <Wallet className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{payout.label}</span>
              <StatusPill status={payout.status} />
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

export default function SettlementPage() {
  return (
    <RequireAuth roles="producer">
      <SettlementInner />
    </RequireAuth>
  );
}
