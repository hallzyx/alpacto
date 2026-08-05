"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AmountPen, ErrorBanner, RequireAuth, Skeleton, StatusPill } from "~~/components/alpacto";
import { apiFetch } from "~~/lib/api";
import { formatKg } from "~~/lib/format";
import type { LocalPayout, Settlement, SettlementPreview } from "~~/lib/types";

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
    <div className="alp-page">
      <div>
        <Link href={`/producer/lots/${id}`} className="alp-link-btn">
          ← Volver al lote
        </Link>
        <h1 className="alp-title" style={{ marginTop: "0.75rem" }}>
          Liquidación
        </h1>
        <p className="alp-subtitle">Resumen final en soles. Confirmación simple, sin gas ni wallets.</p>
      </div>

      {error ? <ErrorBanner message={error} onDismiss={() => setError("")} /> : null}

      {amounts ? (
        <div className="alp-panel">
          <dl className="alp-kv">
            <dt>Peso</dt>
            <dd>{formatKg(amounts.weightGrams)}</dd>
            <dt>Categoría</dt>
            <dd>{amounts.categoryCode}</dd>
            <dt>Bruto</dt>
            <dd>
              <AmountPen minor={amounts.grossPenMinor} size="sm" />
            </dd>
            <dt>Prima</dt>
            <dd>
              <AmountPen minor={amounts.bonusPenMinor} size="sm" />
            </dd>
            <dt>Comisión</dt>
            <dd>
              <AmountPen minor={amounts.feePenMinor} size="sm" />
            </dd>
            <dt>Plataforma</dt>
            <dd>
              <AmountPen minor={amounts.platformFeePenMinor ?? "0"} size="sm" />
            </dd>
          </dl>
          <div style={{ marginTop: "1rem" }}>
            <p className="alp-muted" style={{ margin: 0 }}>
              Total a recibir
            </p>
            <AmountPen minor={amounts.netPenMinor} size="lg" />
          </div>
          {settlement ? (
            <div style={{ marginTop: "0.75rem" }}>
              <StatusPill status={settlement.status} />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="alp-actions">
        {!settlement ? (
          <button
            type="button"
            className="alp-btn alp-btn--primary"
            disabled={busy || !preview}
            onClick={() => void accept()}
          >
            {busy ? "Confirmando…" : "Aceptar liquidación"}
          </button>
        ) : (
          <button
            type="button"
            className="alp-btn alp-btn--primary"
            disabled={busy || !!payout}
            onClick={() => void simulatePayout()}
          >
            {busy ? "…" : "Simular pago local"}
          </button>
        )}
      </div>

      {payout ? (
        <div className="alp-panel">
          <div className="alp-actions" style={{ marginBottom: "0.75rem" }}>
            <span className="alp-sim-badge">Simulación</span>
            <StatusPill status={payout.status} />
          </div>
          <p style={{ margin: "0 0 0.5rem" }}>{payout.label}</p>
          <dl className="alp-kv">
            <dt>Monto</dt>
            <dd>
              <AmountPen minor={payout.amountPenMinor} />
            </dd>
            <dt>Referencia</dt>
            <dd>{payout.reference ?? "—"}</dd>
          </dl>
        </div>
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
