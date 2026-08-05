"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CreateOrderForm, RequireAuth } from "~~/components/alpacto";
import { apiFetch } from "~~/lib/api";
import type { Order } from "~~/lib/types";

function NewOrderInner() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch<{ orders: Order[] }>("/orders");
        if (!cancelled) setOrders(data.orders);
      } catch {
        /* ignore — form works without list */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">Nueva orden</h1>
        <p className="text-muted-foreground">Define la meta de kg y el presupuesto a fondear.</p>
      </div>
      <CreateOrderForm existingOrders={orders} />
    </div>
  );
}

export default function NewOrderPage() {
  return (
    <RequireAuth roles={["buyer", "admin"]}>
      <NewOrderInner />
    </RequireAuth>
  );
}
