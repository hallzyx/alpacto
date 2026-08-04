"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AmountPen, EmptyState, ErrorBanner, RequireAuth, Skeleton, StatusPill } from "~~/components/alpacto";
import { apiFetch } from "~~/lib/api";
import type { Lot, SettlementPreview } from "~~/lib/types";

function shortLotId(id: string) {
  return `Lote ${id.slice(0, 8)}`;
}

function ProducerLotsInner() {
  const [lots, setLots] = useState<Lot[]>([]);
  const [estimates, setEstimates] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const data = await apiFetch<{ lots: Lot[] }>("/lots");
        if (cancelled) return;
        setLots(data.lots);
        const next: Record<string, string> = {};
        await Promise.all(
          data.lots.map(async lot => {
            if (lot.currentInspectionVersion < 1) return;
            try {
              const preview = await apiFetch<SettlementPreview>(`/lots/${lot.id}/settlement-preview`);
              next[lot.id] = preview.netPenMinor;
            } catch {
              /* preview unavailable */
            }
          }),
        );
        if (!cancelled) setEstimates(next);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "No se pudieron cargar los lotes");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <Skeleton rows={5} />;

  return (
    <div className="alp-page">
      <div>
        <h1 className="alp-title">Mis lotes</h1>
        <p className="alp-subtitle">Estado y pago estimado en soles.</p>
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      {!lots.length ? (
        <EmptyState title="Aún no hay lotes" description="Cuando la asociación registre tu fibra, aparecerá aquí." />
      ) : (
        <div className="alp-list">
          {lots.map(lot => (
            <Link key={lot.id} href={`/producer/lots/${lot.id}`} className="alp-panel alp-lot-row">
              <div className="alp-lot-row__meta">
                <span className="alp-lot-row__id">{shortLotId(lot.id)}</span>
                <StatusPill status={lot.status} />
              </div>
              <div style={{ textAlign: "right" }}>
                <p className="alp-muted" style={{ margin: 0, fontSize: "0.8rem" }}>
                  Estimado
                </p>
                <AmountPen minor={estimates[lot.id]} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProducerPage() {
  return (
    <RequireAuth roles="producer">
      <ProducerLotsInner />
    </RequireAuth>
  );
}
