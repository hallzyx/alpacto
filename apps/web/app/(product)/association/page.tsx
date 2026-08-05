"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CampaignDetails,
  CreateCampaignForm,
  EmptyState,
  ErrorBanner,
  RegisterLotForm,
  RequireAuth,
  Skeleton,
  StatusPill,
} from "~~/components/alpacto";
import { apiFetch } from "~~/lib/api";
import { formatUsdCents } from "~~/lib/format";
import type { Campaign, Lot, Order } from "~~/lib/types";

function AssociationInner() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [c, o, l] = await Promise.all([
        apiFetch<{ campaigns: Campaign[] }>("/campaigns"),
        apiFetch<{ orders: Order[] }>("/orders"),
        apiFetch<{ lots: Lot[] }>("/lots"),
      ]);
      setCampaigns(c.campaigns);
      setOrders(o.orders);
      setLots(l.lots);
      setSelectedCampaignId(prev => {
        if (prev && c.campaigns.some(x => x.id === prev)) return prev;
        return c.campaigns[0]?.id ?? "";
      });
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

  const lotsByStatus = useMemo(() => {
    const map = new Map<string, number>();
    for (const lot of lots) {
      map.set(lot.status, (map.get(lot.status) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [lots]);

  const selectedCampaign = useMemo(
    () => campaigns.find(c => c.id === selectedCampaignId) ?? null,
    [campaigns, selectedCampaignId],
  );

  if (loading) return <Skeleton rows={6} />;

  return (
    <div className="alp-page">
      <div>
        <h1 className="alp-title">Asociación</h1>
        <p className="alp-subtitle">Campañas, órdenes y registro de lotes para el demo.</p>
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      <RegisterLotForm onRegistered={() => void load()} />

      <CreateCampaignForm
        onCreated={campaign => {
          void load().then(() => setSelectedCampaignId(campaign.id));
        }}
      />

      <section className="alp-panel">
        <h2 className="alp-title" style={{ fontSize: "1.25rem" }}>
          Campañas
        </h2>
        {!campaigns.length ? (
          <EmptyState title="Sin campañas" />
        ) : (
          <div className="alp-list">
            {campaigns.map(c => (
              <button
                key={c.id}
                type="button"
                className="alp-lot-row"
                style={{
                  padding: "0.35rem 0",
                  width: "100%",
                  textAlign: "left",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                }}
                onClick={() => setSelectedCampaignId(c.id)}
              >
                <div className="alp-lot-row__meta">
                  <span className="alp-lot-row__id">{c.name}</span>
                  <StatusPill status={c.status} />
                </div>
                <span className="alp-muted">{c.associationName ?? ""}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {selectedCampaign ? <CampaignDetails campaign={selectedCampaign} /> : null}

      <section className="alp-panel">
        <h2 className="alp-title" style={{ fontSize: "1.25rem" }}>
          Órdenes
        </h2>
        {!orders.length ? (
          <p className="alp-muted">Sin órdenes.</p>
        ) : (
          <div className="alp-list">
            {orders.map(o => (
              <div key={o.id} className="alp-lot-row" style={{ padding: "0.35rem 0" }}>
                <div className="alp-lot-row__meta">
                  <span className="alp-lot-row__id">{o.externalRef ?? o.id.slice(0, 8)}</span>
                  <StatusPill status={o.status} />
                </div>
                <span className="alp-muted">{formatUsdCents(o.budgetUsdCents)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="alp-panel">
        <h2 className="alp-title" style={{ fontSize: "1.25rem" }}>
          Lotes por estado
        </h2>
        {!lotsByStatus.length ? (
          <p className="alp-muted">Sin lotes.</p>
        ) : (
          <dl className="alp-kv">
            {lotsByStatus.map(([status, count]) => (
              <div key={status} style={{ display: "contents" }}>
                <dt>
                  <StatusPill status={status} />
                </dt>
                <dd>{count}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>
    </div>
  );
}

export default function AssociationPage() {
  return (
    <RequireAuth roles={["association", "admin"]}>
      <AssociationInner />
    </RequireAuth>
  );
}
