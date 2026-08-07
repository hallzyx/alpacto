"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, ExternalLink, FileText, Wallet } from "lucide-react";
import { ErrorBanner, ProducerSessionKeyGrant, RequireAuth, Skeleton, StatusPill } from "~~/components/alpacto";
import { apiFetch, ApiError } from "~~/lib/api";
import { formatKg, formatPen } from "~~/lib/format";
import { isProducerSessionRequired } from "~~/lib/producer-session-grant";
import type { Settlement, SettlementPreview } from "~~/lib/types";
import { Button } from "~~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~~/components/ui/card";

function shortLotId(id: string) {
  return `Lote ${id.slice(0, 8)}`;
}

function txExplorerUrl(hash: string) {
  return `https://sepolia.arbiscan.io/tx/${hash}`;
}

function SettlementInner() {
  const params = useParams();
  const id = String(params.id);
  const [preview, setPreview] = useState<SettlementPreview | null>(null);
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [needsSessionGrant, setNeedsSessionGrant] = useState(false);

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
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const accept = async () => {
    setBusy(true);
    setError("");
    setNeedsSessionGrant(false);
    try {
      const s = await apiFetch<Settlement>(`/lots/${id}/settlement/accept`, { method: "POST", body: {} });
      setSettlement(s);
    } catch (err) {
      if (isProducerSessionRequired(err) || (err instanceof ApiError && err.code === "PRODUCER_SESSION_REQUIRED")) {
        setNeedsSessionGrant(true);
        setError("Configura tu firma (arriba) y vuelve a aceptar la liquidación.");
      } else {
        setError(err instanceof Error ? err.message : "No se pudo aceptar la liquidación");
      }
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Skeleton rows={5} />;

  const amounts = settlement ?? preview;
  const isDone = settlement != null && ["accepted", "settled"].includes(settlement.status);

  return (
    <div className="flex flex-col gap-6">
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
            Resumen final en soles para {shortLotId(id)}. Al aceptar, el dinero apartado se envía a tu cuenta de pago.
          </p>
        </div>
        {settlement ? (
          <div className="flex items-center gap-2">
            <StatusPill status={settlement.status} />
          </div>
        ) : null}
      </div>

      {error ? <ErrorBanner message={error} onDismiss={() => setError("")} /> : null}

      {needsSessionGrant ? (
        <ProducerSessionKeyGrant
          force
          onGranted={() => {
            setNeedsSessionGrant(false);
            setError("");
            void accept();
          }}
        />
      ) : null}

      {amounts ? (
        <>
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

      {!isDone ? (
        <div className="flex gap-2">
          <Button onClick={() => void accept()} disabled={busy || !preview} size="lg">
            <Wallet className="h-4 w-4" />
            {busy ? "Transfiriendo tu pago…" : "Aceptar y recibir en mi cuenta"}
          </Button>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <CardTitle>Pago enviado a tu cuenta</CardTitle>
                <CardDescription>
                  Aceptaste la liquidación. Liberamos los fondos reservados hacia tu cuenta Alpacto.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span className="text-muted-foreground">Estado</span>
              <StatusPill status={settlement.status} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span className="text-muted-foreground">Neto</span>
              <span className="font-medium">{formatPen(settlement.netPenMinor)}</span>
            </div>
            {settlement.settlementTxHash ? (
              <a
                href={txExplorerUrl(settlement.settlementTxHash)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-sm text-primary underline-offset-4 hover:underline"
              >
                Ver comprobante del pago
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : null}
            <Button asChild variant="outline" className="w-fit">
              <Link href={`/producer/lots/${id}`}>Volver al lote</Link>
            </Button>
          </CardContent>
        </Card>
      )}
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
