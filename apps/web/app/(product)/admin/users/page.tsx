"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, RefreshCw, Users } from "lucide-react";
import { EmptyState, ErrorBanner, RequireAuth, Skeleton } from "~~/components/alpacto";
import { Badge } from "~~/components/ui/badge";
import { Button } from "~~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~~/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~~/components/ui/table";
import { apiFetch } from "~~/lib/api";
import { formatEscrowUsd, shortAddress } from "~~/lib/format";
import type { AdminUserRow, AdminUsersResponse, AdminWalletOrigin } from "~~/lib/types";

function originLabel(origin: AdminWalletOrigin): string {
  switch (origin) {
    case "demo_seed":
      return "Seed demo";
    case "live":
      return "Google / live";
    default:
      return "Sin wallet";
  }
}

function originTone(origin: AdminWalletOrigin): "default" | "secondary" | "outline" {
  switch (origin) {
    case "demo_seed":
      return "secondary";
    case "live":
      return "default";
    default:
      return "outline";
  }
}

function roleLabel(role: string): string {
  const map: Record<string, string> = {
    producer: "Productor",
    inspector: "Inspector",
    association: "Asociación",
    buyer: "Comprador",
    admin: "Admin",
  };
  return map[role] ?? role;
}

function AdminUsersInner() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<AdminUsersResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch<AdminUsersResponse>("/admin/users");
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar usuarios");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const users = data?.users ?? [];

  const stats = useMemo(() => {
    const withWallet = users.filter(u => u.smartAccountAddress).length;
    const seed = users.filter(u => u.walletOrigin === "demo_seed").length;
    const live = users.filter(u => u.walletOrigin === "live").length;
    return { total: users.length, withWallet, seed, live };
  }, [users]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">Users</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Cuentas registradas con Kernel smart account y saldo USDC en Sepolia. Sirve para verificar que seed demo y
            Google/live generan wallet on-chain.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={loading ? "animate-spin" : undefined} />
          Actualizar
        </Button>
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{loading ? "…" : stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Con wallet</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{loading ? "…" : stats.withWallet}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Seed demo</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{loading ? "…" : stats.seed}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Google / live</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{loading ? "…" : stats.live}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="size-4" />
            Directorio
          </CardTitle>
          <CardDescription>
            USDC leído on-chain via {data?.usdcToken ? shortAddress(data.usdcToken) : "token no configurado"} ·{" "}
            {data?.explorerName ?? "Arbiscan"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : users.length === 0 ? (
            <EmptyState title="Sin usuarios" description="Aún no hay filas en la tabla users." />
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Origen wallet</TableHead>
                    <TableHead>Smart account</TableHead>
                    <TableHead className="text-right">USDC</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((row: AdminUserRow) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs md:text-sm">{row.email}</TableCell>
                      <TableCell>{row.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{roleLabel(row.role)}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={originTone(row.walletOrigin)}>{originLabel(row.walletOrigin)}</Badge>
                      </TableCell>
                      <TableCell>
                        {row.smartAccountAddress && row.explorerUrl ? (
                          <a
                            href={row.explorerUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 font-mono text-xs text-primary underline-offset-2 hover:underline"
                          >
                            {shortAddress(row.smartAccountAddress)}
                            <ExternalLink className="size-3 opacity-70" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.smartAccountAddress ? (row.usdcUnits == null ? "—" : formatEscrowUsd(row.usdcUnits)) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            “Seed demo” = emails @demo.alpacto (Kernel derivada de DEMO_WALLET_SEED). “Google / live” = smart account
            vinculada al login ZeroDev (Google/OTP/passkey) u otra cuenta no-demo.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminUsersPage() {
  return (
    <RequireAuth roles="admin">
      <AdminUsersInner />
    </RequireAuth>
  );
}
