"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AmountPen, ErrorBanner, RequireAuth, Skeleton, StatusPill, Timeline } from "~~/components/alpacto";
import { apiFetch } from "~~/lib/api";
import { formatKg } from "~~/lib/format";
import type { LotTimeline, SettlementPreview } from "~~/lib/types";

function ProducerLotInner() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);
  const [data, setData] = useState<LotTimeline | null>(null);
  const [preview, setPreview] = useState<SettlementPreview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const timeline = await apiFetch<LotTimeline>(`/lots/${id}/timeline`);
      setData(timeline);
      if (timeline.lot.currentInspectionVersion >= 1) {
        try {
          setPreview(await apiFetch<SettlementPreview>(`/lots/${id}/settlement-preview`));
        } catch {
          setPreview(null);
        }
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

  const requestReweigh = async () => {
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/lots/${id}/reweigh-request`, {
        method: "POST",
        body: { reasonCode: "weight_dispute", reasonText: "Solicito nuevo pesaje" },
      });
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
  const canSettle =
    latestAudit &&
    (latestAudit.resultCode === "pass" || latestAudit.resultCode === "warning") &&
    data.lot.status !== "settled";

  return (
    <div className="alp-page">
      <div>
        <Link href="/producer" className="alp-link-btn">
          ← Mis lotes
        </Link>
        <h1 className="alp-title" style={{ marginTop: "0.75rem" }}>
          Lote {id.slice(0, 8)}
        </h1>
        <div style={{ marginTop: "0.5rem" }}>
          <StatusPill status={data.lot.status} />
        </div>
      </div>

      {error ? <ErrorBanner message={error} onDismiss={() => setError("")} /> : null}

      <div className="alp-panel">
        <h2 className="alp-title" style={{ fontSize: "1.25rem" }}>
          Inspección
        </h2>
        {latestInspection ? (
          <dl className="alp-kv">
            <dt>Peso</dt>
            <dd>{formatKg(latestInspection.weightGrams)}</dd>
            <dt>Categoría</dt>
            <dd>{latestInspection.categoryCode}</dd>
            <dt>Versión</dt>
            <dd>v{latestInspection.version}</dd>
          </dl>
        ) : (
          <p className="alp-muted">Aún sin inspección.</p>
        )}
      </div>

      {preview ? (
        <div className="alp-panel">
          <h2 className="alp-title" style={{ fontSize: "1.25rem" }}>
            Estimado
          </h2>
          <dl className="alp-kv">
            <dt>Bruto</dt>
            <dd>
              <AmountPen minor={preview.grossPenMinor} size="sm" />
            </dd>
            <dt>Prima</dt>
            <dd>
              <AmountPen minor={preview.bonusPenMinor} size="sm" />
            </dd>
            <dt>Comisión asociación</dt>
            <dd>
              <AmountPen minor={preview.feePenMinor} size="sm" />
            </dd>
            <dt>Comisión plataforma</dt>
            <dd>
              <AmountPen minor={preview.platformFeePenMinor ?? "0"} size="sm" />
            </dd>
            <dt>Total neto</dt>
            <dd>
              <AmountPen minor={preview.netPenMinor} size="md" />
            </dd>
          </dl>
        </div>
      ) : null}

      <div className="alp-panel">
        <h2 className="alp-title" style={{ fontSize: "1.25rem" }}>
          Resultado Ayni
        </h2>
        {latestAudit ? (
          <div className="alp-actions" style={{ alignItems: "center" }}>
            <StatusPill status={latestAudit.resultCode ?? latestAudit.status} />
            <span className="alp-muted">Inspección v{latestAudit.inspectionVersion}</span>
          </div>
        ) : (
          <p className="alp-muted">Ayni aún no ha revisado este lote.</p>
        )}
      </div>

      <div className="alp-actions">
        <button
          type="button"
          className="alp-btn alp-btn--ghost"
          disabled={busy || data.lot.status === "reweighing_requested"}
          onClick={() => void requestReweigh()}
        >
          Solicitar nuevo pesaje
        </button>
        <button
          type="button"
          className="alp-btn alp-btn--primary"
          disabled={!canSettle}
          onClick={() => router.push(`/producer/lots/${id}/settlement`)}
        >
          Aceptar liquidación
        </button>
      </div>

      <div className="alp-panel">
        <h2 className="alp-title" style={{ fontSize: "1.25rem" }}>
          Línea de tiempo
        </h2>
        <Timeline events={data.events} />
      </div>
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
