"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { EmptyState, ErrorBanner, RequireAuth, Skeleton, StatusPill } from "~~/components/alpacto";
import { apiFetch } from "~~/lib/api";
import { formatUsdCents } from "~~/lib/format";
import type { Order } from "~~/lib/types";

function BuyerOrdersInner() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch<{ orders: Order[] }>("/orders");
        if (!cancelled) setOrders(data.orders);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Error al cargar órdenes");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <Skeleton rows={4} />;

  return (
    <div className="alp-page">
      <div>
        <h1 className="alp-title">Órdenes</h1>
        <p className="alp-subtitle">Presupuesto y estado de fondeo.</p>
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      {!orders.length ? (
        <EmptyState title="Sin órdenes" description="Cuando crees una orden de compra, aparecerá aquí." />
      ) : (
        <div className="alp-list">
          {orders.map(order => (
            <Link key={order.id} href={`/buyer/orders/${order.id}`} className="alp-panel alp-lot-row">
              <div className="alp-lot-row__meta">
                <span className="alp-lot-row__id">{order.externalRef ?? `Orden ${order.id.slice(0, 8)}`}</span>
                <StatusPill status={order.status} />
              </div>
              <span style={{ fontWeight: 700 }}>{formatUsdCents(order.budgetUsdCents)}</span>
            </Link>
          ))}
        </div>
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
