"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { EmptyState, ErrorBanner, RegisterLotForm, RequireAuth, Skeleton, StatusPill } from "~~/components/alpacto";
import { apiFetch } from "~~/lib/api";
import type { Lot } from "~~/lib/types";

const NEEDS_INSPECTION = new Set(["registered", "reweighing_requested"]);

function InspectorInner() {
  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ lots: Lot[] }>("/lots");
      setLots(data.lots.filter(l => NEEDS_INSPECTION.has(l.status) || l.status === "inspection_submitted"));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar lotes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <Skeleton rows={4} />;

  const pending = lots.filter(l => NEEDS_INSPECTION.has(l.status));

  return (
    <div className="alp-page">
      <div>
        <h1 className="alp-title">Inspecciones</h1>
        <p className="alp-subtitle">Lotes pendientes de pesaje y clasificación.</p>
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      <RegisterLotForm compact onRegistered={() => void load()} />

      {!pending.length ? (
        <EmptyState
          title="Sin lotes pendientes"
          description="Registra un lote arriba o desde Asociación cuando haya fibra por inspeccionar."
        />
      ) : (
        <div className="alp-list">
          {pending.map(lot => (
            <Link key={lot.id} href={`/inspector/lots/${lot.id}/inspect`} className="alp-panel alp-lot-row">
              <div className="alp-lot-row__meta">
                <span className="alp-lot-row__id">Lote {lot.id.slice(0, 8)}</span>
                <StatusPill status={lot.status} />
              </div>
              <span className="alp-link-btn">Inspeccionar →</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function InspectorPage() {
  return (
    <RequireAuth roles={["inspector", "admin"]}>
      <InspectorInner />
    </RequireAuth>
  );
}
