"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CampaignDetails,
  CreateCampaignForm,
  EmptyState,
  ErrorBanner,
  RequireAuth,
  Skeleton,
  StatusPill,
} from "~~/components/alpacto";
import { apiFetch } from "~~/lib/api";
import type { Campaign } from "~~/lib/types";

function BuyerCampaignsInner() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ campaigns: Campaign[] }>("/campaigns");
      setCampaigns(data.campaigns);
      setSelectedId(prev => {
        if (prev && data.campaigns.some(c => c.id === prev)) return prev;
        return data.campaigns[0]?.id ?? "";
      });
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar campañas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(() => campaigns.find(c => c.id === selectedId) ?? null, [campaigns, selectedId]);

  if (loading) return <Skeleton rows={6} />;

  return (
    <div className="alp-page">
      <div>
        <h1 className="alp-title">Campañas</h1>
        <p className="alp-subtitle">
          Marco comercial: asociación, ventana y precios. Luego creas órdenes dentro de una campaña.
        </p>
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      <CreateCampaignForm
        onCreated={campaign => {
          void load().then(() => setSelectedId(campaign.id));
        }}
      />

      <section className="alp-panel">
        <h2 className="alp-title" style={{ fontSize: "1.25rem" }}>
          Campañas existentes
        </h2>
        {!campaigns.length ? (
          <EmptyState title="Sin campañas" description="Crea la primera arriba." />
        ) : (
          <div className="alp-list" style={{ marginTop: "0.75rem" }}>
            {campaigns.map(c => (
              <button
                key={c.id}
                type="button"
                className="alp-panel alp-lot-row"
                style={{
                  width: "100%",
                  textAlign: "left",
                  cursor: "pointer",
                  borderColor: c.id === selectedId ? "var(--alp-accent, #0d9488)" : undefined,
                }}
                onClick={() => setSelectedId(c.id)}
              >
                <div className="alp-lot-row__meta">
                  <span className="alp-lot-row__id">{c.name}</span>
                  <StatusPill status={c.status} />
                </div>
                <span className="alp-muted">{c.associationName ?? "—"}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {selected ? <CampaignDetails campaign={selected} /> : null}

      <p className="alp-muted">
        ¿Listo para comprar?{" "}
        <Link href="/buyer/orders" className="alp-link-btn">
          Ir a órdenes →
        </Link>
      </p>
    </div>
  );
}

export default function BuyerCampaignsPage() {
  return (
    <RequireAuth roles={["buyer", "admin"]}>
      <BuyerCampaignsInner />
    </RequireAuth>
  );
}
