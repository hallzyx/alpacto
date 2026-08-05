"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ClipboardList, Package, RotateCcw, Scale } from "lucide-react";
import { EmptyState, ErrorBanner, RequireAuth, Skeleton, StatusPill } from "~~/components/alpacto";
import { Button } from "~~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~~/components/ui/card";
import { apiFetch } from "~~/lib/api";
import { orderDisplayRef } from "~~/lib/format";
import type { Lot, Order } from "~~/lib/types";

const NEEDS_INSPECTION = new Set(["registered", "reweighing_requested"]);
// awaiting_producer_confirmation / producer_declined are blocked until producer confirms

function shortLotId(id: string) {
  return `Lote ${id.slice(0, 8)}`;
}

function InspectorInner() {
  const [lots, setLots] = useState<Lot[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const orderRefById = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of orders) map.set(o.id, orderDisplayRef(o.externalRef, o.id));
    return map;
  }, [orders]);

  const load = useCallback(async () => {
    try {
      const [lotsRes, ordersRes] = await Promise.all([
        apiFetch<{ lots: Lot[] }>("/lots"),
        apiFetch<{ orders: Order[] }>("/orders"),
      ]);
      setLots(
        lotsRes.lots.filter(
          l => NEEDS_INSPECTION.has(l.status) || ["inspection_submitted", "auditing"].includes(l.status),
        ),
      );
      setOrders(ordersRes.orders);
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

  const pending = lots.filter(l => l.status === "registered");
  const reweighs = lots.filter(l => l.status === "reweighing_requested");
  const inReview = lots.filter(l => ["inspection_submitted", "auditing"].includes(l.status));

  if (loading) return <Skeleton rows={6} />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">Inspector</h1>
        <p className="text-muted-foreground">Lotes pendientes de pesaje y clasificación.</p>
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Por inspeccionar</CardTitle>
            <Scale className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="font-display text-3xl font-semibold text-foreground">{pending.length}</p>
            <p className="text-xs text-muted-foreground">confirmados por productor</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Nuevo pesaje</CardTitle>
            <RotateCcw className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="font-display text-3xl font-semibold text-foreground">{reweighs.length}</p>
            <p className="text-xs text-muted-foreground">solicitados por productor</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">En revisión Ayni</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="font-display text-3xl font-semibold text-foreground">{inReview.length}</p>
            <p className="text-xs text-muted-foreground">inspección enviada</p>
          </CardContent>
        </Card>
      </div>

      {reweighs.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Revisiones solicitadas</CardTitle>
            <CardDescription>El productor pidió un nuevo pesaje en estos lotes</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Lote</th>
                    <th className="px-4 py-2.5 font-medium">Orden</th>
                    <th className="px-4 py-2.5 font-medium">Estado</th>
                    <th className="px-4 py-2.5 font-medium text-right">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {reweighs.map(lot => (
                    <tr key={lot.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="px-4 py-2.5 font-medium">{shortLotId(lot.id)}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {orderRefById.get(lot.orderId) ?? orderDisplayRef(null, lot.orderId)}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusPill status={lot.status} />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/inspector/lots/${lot.id}/inspect`}>
                            Reinspeccionar <ArrowRight className="h-4 w-4" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Pendientes de inspección</CardTitle>
          <CardDescription>Lotes confirmados por el productor, listos para pesar y clasificar</CardDescription>
        </CardHeader>
        <CardContent>
          {!pending.length ? (
            <EmptyState
              title="Sin lotes pendientes"
              description="Cuando la asociación registre un lote y el productor confirme, aparecerá aquí."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Lote</th>
                    <th className="px-4 py-2.5 font-medium">Orden</th>
                    <th className="px-4 py-2.5 font-medium">Estado</th>
                    <th className="px-4 py-2.5 font-medium text-right">Registrado</th>
                    <th className="px-4 py-2.5 font-medium text-right">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map(lot => (
                    <tr key={lot.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/inspector/lots/${lot.id}/inspect`}
                          className="font-medium hover:text-primary hover:underline"
                        >
                          {shortLotId(lot.id)}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {orderRefById.get(lot.orderId) ?? orderDisplayRef(null, lot.orderId)}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusPill status={lot.status} />
                      </td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground">
                        {new Date(lot.createdAt).toLocaleDateString("es-PE", { month: "short", day: "numeric" })}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Button asChild size="sm">
                          <Link href={`/inspector/lots/${lot.id}/inspect`}>
                            Inspeccionar <ArrowRight className="h-4 w-4" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {inReview.length ? (
        <Card>
          <CardHeader>
            <CardTitle>En revisión</CardTitle>
            <CardDescription>Inspección enviada; Ayni Auditor está revisando la evidencia</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {inReview.map(lot => (
                <div
                  key={lot.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 p-4"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-muted">
                      <Package className="h-4 w-4 text-primary" />
                    </span>
                    <div>
                      <p className="text-sm font-medium">{shortLotId(lot.id)}</p>
                      <StatusPill status={lot.status} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
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
