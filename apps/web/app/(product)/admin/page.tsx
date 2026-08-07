"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ExternalLink, FileCheck2, Landmark, RefreshCw, ShieldAlert, Wallet } from "lucide-react";
import { EmptyState, ErrorBanner, RequireAuth, Skeleton } from "~~/components/alpacto";
import { Badge } from "~~/components/ui/badge";
import { Button } from "~~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~~/components/ui/card";
import { apiFetch, API_URL } from "~~/lib/api";
import { formatEscrowUsd, ONCHAIN_ACTIVITY_LABELS, shortTxHash } from "~~/lib/format";
import type { OnchainActivity, OnchainActivityResponse, OnchainActivityType } from "~~/lib/types";
import deployedContracts from "~~/contracts/deployedContracts";

const FILTERS: Array<{ id: "all" | OnchainActivityType; label: string }> = [
  { id: "all", label: "Todas" },
  { id: "order_funded", label: "Fondeos" },
  { id: "lot_registered", label: "Lotes" },
  { id: "inspection", label: "Inspecciones" },
  { id: "audit_attest", label: "Attests Ayni" },
  { id: "reweigh", label: "Re-pesajes" },
  { id: "settlement", label: "Liquidaciones" },
  { id: "remainder_withdraw", label: "Remanentes" },
];

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("es-PE", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function isLocalTx(hash: string): boolean {
  return hash.startsWith("local-") || hash.startsWith("0xlocal");
}

function typeTone(type: string): "default" | "secondary" | "outline" | "destructive" {
  switch (type) {
    case "settlement":
      return "default";
    case "order_funded":
    case "remainder_withdraw":
      return "secondary";
    case "audit_attest":
    case "lot_registered":
      return "outline";
    default:
      return "outline";
  }
}

function AdminInner() {
  const [health, setHealth] = useState("…");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revokeResult, setRevokeResult] = useState("");
  const [loading, setLoading] = useState(true);
  const [onchain, setOnchain] = useState<OnchainActivityResponse | null>(null);
  const [filter, setFilter] = useState<"all" | OnchainActivityType>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [activity, h] = await Promise.all([
        apiFetch<OnchainActivityResponse>("/admin/onchain-activity"),
        apiFetch<{ status: string; service: string }>("/health", { auth: false }).catch(() => null),
      ]);
      setOnchain(activity);
      setHealth(h ? `${h.service}: ${h.status}` : "API no disponible");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el panel admin");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activities = onchain?.activities ?? [];

  const kpis = useMemo(() => {
    const byType = (t: OnchainActivityType) => activities.filter(a => a.type === t);
    const funded = byType("order_funded");
    const settlements = byType("settlement");
    const attests = byType("audit_attest");
    const escrowSum = funded.reduce((acc, a) => {
      if (!a.amountUsdcUnits) return acc;
      return acc + BigInt(a.amountUsdcUnits);
    }, 0n);
    const settledSum = settlements.reduce((acc, a) => {
      if (!a.amountUsdcUnits) return acc;
      return acc + BigInt(a.amountUsdcUnits);
    }, 0n);
    const onExplorer = activities.filter(a => !isLocalTx(a.txHash)).length;
    return {
      total: activities.length,
      funded: funded.length,
      settlements: settlements.length,
      attests: attests.length,
      escrowSum,
      settledSum,
      onExplorer,
      lastAt: activities[0]?.at ?? null,
    };
  }, [activities]);

  const filtered = useMemo(() => {
    if (filter === "all") return activities;
    return activities.filter(a => a.type === filter);
  }, [activities, filter]);

  const revoke = async () => {
    setBusy(true);
    setError("");
    setRevokeResult("");
    try {
      const res = await apiFetch<{ revoked: number }>("/admin/ayni/session-key/revoke", {
        method: "POST",
        body: {},
      });
      setRevokeResult(`Claves revocadas: ${res.revoked}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo revocar");
    } finally {
      setBusy(false);
    }
  };

  const sepolia = (deployedContracts as Record<string, Record<string, { address: string }>>)["421614"];
  const core = sepolia?.["alpacto-core"]?.address;

  if (loading) return <Skeleton rows={6} />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">Admin</h1>
          <p className="text-muted-foreground">
            Monitoreo de transacciones on-chain · {onchain?.explorerName ?? "Arbiscan"}
            {onchain?.chainId ? ` · chain ${onchain.chainId}` : ""}
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void load()} className="shrink-0 gap-2">
          <RefreshCw className="size-4" />
          Actualizar
        </Button>
      </div>

      {error ? <ErrorBanner message={error} onDismiss={() => setError("")} /> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tx registradas</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="font-display text-3xl font-semibold text-foreground">{kpis.total}</p>
            <p className="text-xs text-muted-foreground">
              {kpis.onExplorer} en explorer · {kpis.total - kpis.onExplorer} locales
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Fondeos escrow</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="font-display text-3xl font-semibold text-foreground">{kpis.funded}</p>
            <p className="text-xs text-muted-foreground">{formatEscrowUsd(kpis.escrowSum)} USDC fondeados</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Liquidaciones</CardTitle>
            <Landmark className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="font-display text-3xl font-semibold text-foreground">{kpis.settlements}</p>
            <p className="text-xs text-muted-foreground">{formatEscrowUsd(kpis.settledSum)} USDC liquidados</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Attests Ayni</CardTitle>
            <FileCheck2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="font-display text-3xl font-semibold text-foreground">{kpis.attests}</p>
            <p className="text-xs text-muted-foreground">
              {kpis.lastAt ? `Última actividad ${formatWhen(kpis.lastAt)}` : "Sin actividad aún"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Actividad on-chain</CardTitle>
              <CardDescription>Fondeos, attests, liquidaciones e inspecciones con enlace al explorer</CardDescription>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map(f => (
              <Button
                key={f.id}
                type="button"
                size="sm"
                variant={filter === f.id ? "default" : "outline"}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
                {f.id !== "all" ? (
                  <span className="ml-1.5 text-xs opacity-70">{activities.filter(a => a.type === f.id).length}</span>
                ) : null}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!filtered.length ? (
            <div className="px-6 pb-6">
              <EmptyState
                title="Sin transacciones en este filtro"
                description="Aparecerán al fondear una orden, auditar un lote o liquidar on-chain."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Cuándo</th>
                    <th className="px-4 py-2.5 font-medium">Tipo</th>
                    <th className="px-4 py-2.5 font-medium">Orden / lote</th>
                    <th className="px-4 py-2.5 font-medium">Detalle</th>
                    <th className="px-4 py-2.5 font-medium">Monto</th>
                    <th className="px-4 py-2.5 font-medium text-right">Tx</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item: OnchainActivity) => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatWhen(item.at)}</td>
                      <td className="px-4 py-3">
                        <Badge variant={typeTone(item.type)}>{ONCHAIN_ACTIVITY_LABELS[item.type] ?? item.type}</Badge>
                        {isLocalTx(item.txHash) ? (
                          <Badge variant="outline" className="ml-1.5">
                            local
                          </Badge>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{item.orderRef ?? item.orderId?.slice(0, 8) ?? "—"}</div>
                        {item.lotId ? (
                          <div className="font-mono text-xs text-muted-foreground">{item.lotId.slice(0, 8)}</div>
                        ) : null}
                      </td>
                      <td className="max-w-[18rem] truncate px-4 py-3 text-muted-foreground">{item.detail ?? "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {item.amountUsdcUnits ? `${formatEscrowUsd(item.amountUsdcUnits)} USDC` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isLocalTx(item.txHash) ? (
                          <span className="font-mono text-xs text-muted-foreground">{shortTxHash(item.txHash)}</span>
                        ) : (
                          <a
                            href={item.explorerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
                          >
                            {shortTxHash(item.txHash)}
                            <ExternalLink className="size-3" />
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>API</CardTitle>
            <CardDescription>Estado del backend</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-muted-foreground">Base URL</p>
              <p className="break-all font-mono text-xs">{API_URL}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Health</p>
              <p className="font-medium">{health}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contratos</CardTitle>
            <CardDescription>Direcciones desplegadas (solo admin)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-muted-foreground">AlpactoCore (Sepolia)</p>
              <p className="break-all font-mono text-xs">{core ?? "— (despliega en sepolia)"}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="size-4" />
              Llave de sesión de Ayni
            </CardTitle>
            <CardDescription>Control de emergencia para la identidad on-chain del auditor automático</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              Smart wallet propia de Ayni (ZeroDev): solo attestations on-chain, sin mover fondos. Revocar desactiva la
              llave si rotaste credenciales o hay incidente.
            </p>
            <Button type="button" variant="destructive" disabled={busy} onClick={() => void revoke()}>
              {busy ? "Revocando…" : "Revocar llaves activas"}
            </Button>
            {revokeResult ? <p className="text-sm text-muted-foreground">{revokeResult}</p> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function AdminPage() {
  return (
    <RequireAuth roles="admin">
      <AdminInner />
    </RequireAuth>
  );
}
