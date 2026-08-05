"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  EmptyState,
  ErrorBanner,
  PricingPolicyHelpButton,
  RequireAuth,
  Skeleton,
  StatusPill,
} from "~~/components/alpacto";
import { Button } from "~~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~~/components/ui/card";
import { apiFetch } from "~~/lib/api";
import { formatPen } from "~~/lib/format";
import type { PricingPolicy } from "~~/lib/types";
import { useAuth } from "~~/components/alpacto/AuthProvider";

function BuyerPricingInner() {
  const { user } = useAuth();
  const [policies, setPolicies] = useState<PricingPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ policies: PricingPolicy[] }>("/pricing-policies?mine=1");
      setPolicies(data.policies);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar las políticas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <Skeleton rows={5} />;

  const mine = policies.filter(p => p.createdBy && user && p.createdBy === user.id);
  const platform = policies.filter(p => !p.createdBy);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">Políticas de precios</h1>
          <p className="text-muted-foreground">
            Define precios por categoría (FINE / MEDIUM / COARSE) para adjuntarlos a tus campañas.
          </p>
        </div>
        <Button asChild>
          <Link href="/buyer/pricing/new">Nueva política</Link>
        </Button>
      </div>

      {error ? <ErrorBanner message={error} onDismiss={() => setError("")} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>Mis políticas</CardTitle>
          <CardDescription>
            Versiones que creaste. Al crear una campaña, eliges una de estas (o la política demo de plataforma).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!mine.length ? (
            <EmptyState
              title="Aún no tienes políticas propias"
              description="Crea una con FINE, MEDIUM y COARSE para usarla en campañas nuevas."
            />
          ) : (
            <div className="grid gap-4">
              {mine.map(policy => (
                <PolicyCard key={policy.id} policy={policy} mine />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {platform.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Políticas de plataforma</CardTitle>
            <CardDescription>Políticas demo / seed disponibles para cualquier campaña.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              {platform.map(policy => (
                <PolicyCard key={policy.id} policy={policy} />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function PolicyCard({ policy, mine = false }: { policy: PricingPolicy; mine?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-display text-lg font-semibold">Política v{policy.version}</p>
          {mine ? <StatusPill status="active" label="Tuya" /> : <StatusPill status="draft" label="Plataforma" />}
          <PricingPolicyHelpButton policy={policy} />
        </div>
        <p className="text-xs text-muted-foreground">
          {policy.createdAt
            ? new Date(policy.createdAt).toLocaleDateString("es-PE", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })
            : null}
        </p>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Comisión asociación {(policy.associationFeeBps / 100).toFixed(1)}% · plataforma{" "}
        {((policy.platformFeeBps ?? 50) / 100).toFixed(1)}% · tolerancia {(policy.weightToleranceBps / 100).toFixed(1)}%
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 pr-4 font-medium">Categoría</th>
              <th className="py-2 pr-4 font-medium">Código</th>
              <th className="py-2 text-right font-medium">Precio / kg</th>
            </tr>
          </thead>
          <tbody>
            {policy.categories.map(c => (
              <tr key={c.code} className="border-b last:border-0">
                <td className="py-2 pr-4">{c.label}</td>
                <td className="py-2 pr-4 text-muted-foreground">{c.code}</td>
                <td className="py-2 text-right font-medium">{formatPen(c.pricePenMinorPerKg)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3">
        <Button asChild size="sm" variant="outline">
          <Link href={`/buyer/campaigns/new?policyId=${policy.id}`}>Usar en campaña →</Link>
        </Button>
      </div>
    </div>
  );
}

export default function BuyerPricingPage() {
  return (
    <RequireAuth roles={["buyer", "admin"]}>
      <BuyerPricingInner />
    </RequireAuth>
  );
}
