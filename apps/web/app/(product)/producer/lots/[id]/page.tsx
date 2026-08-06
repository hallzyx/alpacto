"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ClipboardCheck, FileText, Scale, ShieldAlert, Wallet } from "lucide-react";
import toast from "react-hot-toast";
import {
  ErrorBanner,
  ProducerOrderContextCard,
  RequireAuth,
  Skeleton,
  StatusPill,
  Timeline,
} from "~~/components/alpacto";
import { apiFetch } from "~~/lib/api";
import { formatKg, formatPen, orderDisplayRef, statusLabel } from "~~/lib/format";
import type { AuditRunDetail, LotTimeline, ProducerOrderParticipation, SettlementPreview } from "~~/lib/types";
import { Badge } from "~~/components/ui/badge";
import { Button } from "~~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~~/components/ui/card";
import { Field, FieldLabel } from "~~/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~~/components/ui/select";

function shortLotId(id: string) {
  return `Lote ${id.slice(0, 8)}`;
}

const DECLINE_REASONS = [
  { value: "wrong_weight", label: "El peso o los datos no coinciden con lo que entregué" },
  { value: "wrong_producer", label: "Me asignaron un lote que no es mío" },
  { value: "not_my_fiber", label: "No es mi fibra" },
  { value: "wrong_order", label: "Está en la orden / campaña equivocada" },
  { value: "other", label: "Otro motivo" },
] as const;

function ProducerLotInner() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);
  const [data, setData] = useState<LotTimeline | null>(null);
  const [orderContext, setOrderContext] = useState<ProducerOrderParticipation | null>(null);
  const [preview, setPreview] = useState<SettlementPreview | null>(null);
  const [auditDetail, setAuditDetail] = useState<AuditRunDetail | null>(null);
  const [declineReason, setDeclineReason] = useState<string>("wrong_weight");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const timeline = await apiFetch<LotTimeline>(`/lots/${id}/timeline`);
      setData(timeline);
      try {
        setOrderContext(await apiFetch<ProducerOrderParticipation>(`/producer/lots/${id}/context`));
      } catch {
        setOrderContext(null);
      }
      if (timeline.lot.currentInspectionVersion >= 1) {
        try {
          setPreview(await apiFetch<SettlementPreview>(`/lots/${id}/settlement-preview`));
        } catch {
          setPreview(null);
        }
      } else {
        setPreview(null);
      }
      if (timeline.audits[0]) {
        try {
          setAuditDetail(await apiFetch<AuditRunDetail>(`/audits/${timeline.audits[0].id}`));
        } catch {
          setAuditDetail(null);
        }
      } else {
        setAuditDetail(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el lote");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const confirmLot = async () => {
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/lots/${id}/confirm`, { method: "POST", body: {} });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo confirmar el lote");
    } finally {
      setBusy(false);
    }
  };

  const declineLot = async () => {
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/lots/${id}/decline`, {
        method: "POST",
        body: {
          reasonCode: declineReason,
          reasonText: DECLINE_REASONS.find(r => r.value === declineReason)?.label,
        },
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo declinar el lote");
    } finally {
      setBusy(false);
    }
  };

  const requestReweigh = async () => {
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/lots/${id}/reweigh-request`, {
        method: "POST",
        body: { reasonCode: "weight_dispute", reasonText: "Solicito nuevo pesaje" },
      });
      toast.success("Nuevo pesaje solicitado. El inspector será notificado.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo solicitar nuevo pesaje");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Skeleton rows={6} />;
  if (!data) return <ErrorBanner message={error || "Lote no encontrado"} />;

  const latestInspection = data.inspections[data.inspections.length - 1];
  const latestAudit = data.audits[0];
  const awaitingConfirm = data.lot.status === "awaiting_producer_confirmation";
  const declined = data.lot.status === "producer_declined";
  const lotClosed = ["settled", "settlement_accepted", "cancelled"].includes(data.lot.status);
  const canSettle =
    Boolean(latestAudit) &&
    (latestAudit?.resultCode === "pass" || latestAudit?.resultCode === "warning") &&
    !lotClosed &&
    !awaitingConfirm &&
    !declined;
  const canRequestReweigh =
    data.lot.currentInspectionVersion >= 1 &&
    data.lot.status !== "reweighing_requested" &&
    !lotClosed &&
    !awaitingConfirm &&
    !declined;
  const ayniNeedsAttention =
    latestAudit &&
    (["review_required", "warning", "unreadable", "failed"].includes(latestAudit.resultCode ?? "") ||
      latestAudit.status === "failed" ||
      data.lot.status === "audit_failed");
  const showAyniCard =
    Boolean(auditDetail) &&
    (ayniNeedsAttention || (auditDetail?.findings.length ?? 0) > 0 || Boolean(auditDetail?.progressLabel));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <Link
            href="/producer/lots"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Mis lotes
          </Link>
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">{shortLotId(id)}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Registrado el {new Date(data.lot.createdAt).toLocaleDateString("es-PE")}
              {orderContext ? ` · ${orderDisplayRef(orderContext.externalRef, orderContext.orderId)}` : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={data.lot.status} />
            {latestAudit ? (
              <Badge variant="outline">Ayni: {statusLabel(latestAudit.resultCode ?? latestAudit.status)}</Badge>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {canRequestReweigh ? (
            <Button variant="outline" onClick={() => void requestReweigh()} disabled={busy}>
              {busy ? "Solicitando…" : "Solicitar nuevo pesaje"}
            </Button>
          ) : null}
          {canSettle ? (
            <Button onClick={() => router.push(`/producer/lots/${id}/settlement`)}>Aceptar liquidación</Button>
          ) : null}
        </div>
      </div>

      {error ? <ErrorBanner message={error} onDismiss={() => setError("")} /> : null}

      {awaitingConfirm ? (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle>¿Es tu fibra?</CardTitle>
            <CardDescription>
              La asociación registró este lote a tu nombre
              {orderContext ? ` en ${orderDisplayRef(orderContext.externalRef, orderContext.orderId)}` : ""}. Confirma
              si es correcto o declina si hay un error (peso, productor u orden).
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field>
              <FieldLabel>Si declinas, ¿cuál es el motivo?</FieldLabel>
              <Select value={declineReason} onValueChange={setDeclineReason}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  {DECLINE_REASONS.map(r => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void confirmLot()} disabled={busy}>
                {busy ? "…" : "Sí, es mi fibra"}
              </Button>
              <Button variant="outline" onClick={() => void declineLot()} disabled={busy}>
                No es correcto — abrir disputa
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {declined ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive" />
              Disputa enviada a la asociación
            </CardTitle>
            <CardDescription>
              Declaste este lote. La asociación lo verá en “Disputas” y podrá corregirlo, reasignarlo o cancelarlo.
              Mientras tanto no se puede inspeccionar ni liquidar.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {orderContext ? <ProducerOrderContextCard participation={orderContext} highlightLotId={id} compact /> : null}

      {showAyniCard && auditDetail ? (
        <Card>
          <CardHeader>
            <CardTitle>Qué encontró Ayni</CardTitle>
            <CardDescription>
              Revisión automática. No cambia tu pago: te explica si algo no cuadra para que decidas.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Resultado:</span>
              <StatusPill status={auditDetail.resultCode ?? auditDetail.status} />
            </div>
            {auditDetail.status === "failed" && auditDetail.progressLabel && !auditDetail.findings.length ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-foreground">
                Motivo del fallo: {auditDetail.progressLabel}
              </p>
            ) : null}
            {!auditDetail.findings.length ? (
              <p className="text-sm text-muted-foreground">
                {auditDetail.resultCode === "pass"
                  ? "Todo cuadra con la evidencia. Puedes seguir hacia la liquidación cuando esté listo."
                  : auditDetail.status === "failed"
                    ? "La auditoría no terminó bien. Pide a la asociación o al inspector que vuelva a enviar la inspección."
                    : "Ayni marcó revisión. Si no estás de acuerdo con el pesaje, pide un nuevo pesaje."}
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {auditDetail.findings.map(f => (
                  <li key={f.id} className="rounded-lg border px-3 py-2.5 text-sm">
                    <p className="font-medium">{f.explanation ?? statusLabel(f.code)}</p>
                    {(f.declaredValue || f.observedValue) && (
                      <p className="mt-1 text-muted-foreground">
                        Declarado: {f.declaredValue ?? "—"} · En evidencia: {f.observedValue ?? "—"}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canRequestReweigh && ayniNeedsAttention ? (
              <Button variant="outline" className="w-fit" onClick={() => void requestReweigh()} disabled={busy}>
                Pedir nuevo pesaje
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Peso inspeccionado</CardTitle>
            <Scale className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="font-display text-2xl font-semibold text-foreground">
              {latestInspection ? formatKg(latestInspection.weightGrams) : "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              {latestInspection ? `v${latestInspection.version}` : "Sin inspección"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Categoría</CardTitle>
            <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="font-display text-2xl font-semibold text-foreground">
              {latestInspection?.categoryCode ?? "—"}
            </p>
            <p className="text-xs text-muted-foreground">calidad de fibra</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Bruto estimado</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="font-display text-2xl font-semibold text-foreground">
              {preview ? formatPen(preview.grossPenMinor) : "—"}
            </p>
            <p className="text-xs text-muted-foreground">antes de comisiones</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Neto estimado</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="font-display text-2xl font-semibold text-primary">
              {preview ? formatPen(preview.netPenMinor) : "—"}
            </p>
            <p className="text-xs text-muted-foreground">lo que recibirías</p>
          </CardContent>
        </Card>
      </div>

      {preview ? (
        <Card>
          <CardHeader>
            <CardTitle>Desglose de liquidación</CardTitle>
            <CardDescription>Cálculo estimado en soles</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex flex-col gap-1 rounded-lg border p-4">
                <span className="text-sm text-muted-foreground">Bruto</span>
                <span className="text-lg font-semibold">{formatPen(preview.grossPenMinor)}</span>
              </div>
              <div className="flex flex-col gap-1 rounded-lg border p-4">
                <span className="text-sm text-muted-foreground">Prima de calidad</span>
                <span className="text-lg font-semibold text-primary">+ {formatPen(preview.bonusPenMinor)}</span>
              </div>
              <div className="flex flex-col gap-1 rounded-lg border p-4">
                <span className="text-sm text-muted-foreground">Comisión asociación</span>
                <span className="text-lg font-semibold text-destructive">− {formatPen(preview.feePenMinor)}</span>
              </div>
              <div className="flex flex-col gap-1 rounded-lg border p-4">
                <span className="text-sm text-muted-foreground">Comisión plataforma</span>
                <span className="text-lg font-semibold text-destructive">
                  − {formatPen(preview.platformFeePenMinor ?? "0")}
                </span>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between rounded-lg bg-muted p-4">
              <span className="font-medium">Total neto</span>
              <span className="text-2xl font-semibold text-primary">{formatPen(preview.netPenMinor)}</span>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Línea de tiempo</CardTitle>
          <CardDescription>Historial de eventos del lote</CardDescription>
        </CardHeader>
        <CardContent>
          <Timeline events={data.events} />
        </CardContent>
      </Card>
    </div>
  );
}

export default function ProducerLotPage() {
  return (
    <RequireAuth roles="producer">
      <ProducerLotInner />
    </RequireAuth>
  );
}
