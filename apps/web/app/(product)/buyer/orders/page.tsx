"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CreateOrderForm, EmptyState, ErrorBanner, RequireAuth, Skeleton, StatusPill } from "~~/components/alpacto";
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
    <div className="alp-page">
      <div>
        <h1 className="alp-title">Órdenes</h1>
        <p className="alp-subtitle">Meta de kg, presupuesto y estado de fondeo.</p>
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      <CreateOrderForm existingOrders={orders} />

      <section className="alp-panel" style={{ marginTop: "1rem" }}>
        <h2 className="alp-title" style={{ fontSize: "1.25rem" }}>
          Tus órdenes
        </h2>
        {!orders.length ? (
          <EmptyState
            title="Sin órdenes"
            description="Crea una orden arriba. Luego fondea con Stripe y la asociación registrará lotes."
          />
        ) : (
          <div className="alp-list" style={{ marginTop: "0.75rem" }}>
            {orders.map(order => (
              <Link key={order.id} href={`/buyer/orders/${order.id}`} className="alp-panel alp-lot-row">
                <div className="alp-lot-row__meta">
                  <span className="alp-lot-row__id">{order.externalRef ?? `Orden ${order.id.slice(0, 8)}`}</span>
                  <StatusPill status={order.status} />
                </div>
                <span style={{ fontWeight: 700 }}>
                  {order.targetWeightGrams ? `${formatKg(order.targetWeightGrams)} · ` : null}
                  {formatUsdCents(order.budgetUsdCents)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
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
