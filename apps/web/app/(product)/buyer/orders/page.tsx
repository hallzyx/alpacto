"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { EmptyState, ErrorBanner, RequireAuth, Skeleton, StatusPill } from "~~/components/alpacto";
import { Button } from "~~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~~/components/ui/card";
import { apiFetch } from "~~/lib/api";
import { formatKg, formatUsdCents } from "~~/lib/format";
import type { Order } from "~~/lib/types";

function BuyerOrdersInner() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ orders: Order[] }>("/orders");
      setOrders(data.orders);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar órdenes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <Skeleton rows={4} />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">Órdenes</h1>
          <p className="text-muted-foreground">Meta de kg, presupuesto y estado de los fondos.</p>
        </div>
        <Button asChild>
          <Link href="/buyer/orders/new">Nueva orden</Link>
        </Button>
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      {!orders.length ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              title="Sin órdenes"
              description="Crea una orden. Luego fondea con Stripe y la asociación registrará lotes."
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tus órdenes</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="flex flex-col divide-y divide-border">
              {orders.map(order => (
                <Link
                  key={order.id}
                  href={`/buyer/orders/${order.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-accent/50"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{order.externalRef ?? `Orden ${order.id.slice(0, 8)}`}</span>
                    <StatusPill status={order.status} />
                  </div>
                  <span className="text-sm font-medium text-foreground">
                    {order.targetWeightGrams ? `${formatKg(order.targetWeightGrams)} · ` : null}
                    {formatUsdCents(order.budgetUsdCents)}
                  </span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function BuyerOrdersPage() {
  return (
    <RequireAuth roles={["buyer", "admin"]}>
      <BuyerOrdersInner />
    </RequireAuth>
  );
}
