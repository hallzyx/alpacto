"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CampaignDetails, EmptyState, ErrorBanner, RequireAuth, Skeleton, StatusPill } from "~~/components/alpacto";
import { Button } from "~~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~~/components/ui/card";
import { apiFetch } from "~~/lib/api";
import type { Campaign } from "~~/lib/types";

function BuyerCampaignsInner() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch<{ campaigns: Campaign[] }>("/campaigns");
        if (cancelled) return;
        setCampaigns(data.campaigns);
        setSelectedId(prev => {
          if (prev && data.campaigns.some(c => c.id === prev)) return prev;
          return data.campaigns[0]?.id ?? "";
        });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "No se pudieron cargar las campañas");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = useMemo(() => campaigns.find(c => c.id === selectedId) ?? null, [campaigns, selectedId]);

  if (loading) return <Skeleton rows={6} />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">Campañas</h1>
          <p className="text-muted-foreground">Marco comercial: asociación, ventana y precios.</p>
        </div>
        <Button asChild>
          <Link href="/buyer/campaigns/new">Nueva campaña</Link>
        </Button>
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      {!campaigns.length ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState title="Sin campañas" description="Crea la primera campaña para empezar." />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Listado</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 p-0 pb-3">
              {campaigns.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={`flex items-center justify-between gap-2 px-4 py-2 text-left text-sm transition-colors hover:bg-accent ${
                    c.id === selectedId ? "bg-accent font-medium" : ""
                  }`}
                >
                  <span className="truncate">{c.name}</span>
                  <StatusPill status={c.status} />
                </button>
              ))}
            </CardContent>
          </Card>

          {selected ? (
            <CampaignDetails campaign={selected} />
          ) : (
            <Card>
              <CardContent className="pt-6 text-center text-sm text-muted-foreground">
                Selecciona una campaña para ver su detalle.
              </CardContent>
            </Card>
          )}
        </div>
      )}
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
