"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ErrorBanner, StatusPill } from "~~/components/alpacto";
import { apiFetch } from "~~/lib/api";
import { formatEscrowUsd } from "~~/lib/format";
import type { Lot, Order } from "~~/lib/types";

type Producer = {
  id: string;
  email: string;
  name: string;
  smartAccountAddress?: string | null;
};

const ORDERS_ACCEPTING_LOTS = new Set(["funded", "accepting_lots", "partially_settled"]);

const DEMO_ORDER_REF = "ALP-2026-001";
const DEMO_PRODUCER_EMAIL = "martina@demo.alpacto";

type RegisterLotFormProps = {
  onRegistered?: (lot: Lot) => void;
  compact?: boolean;
};

export function RegisterLotForm({ onRegistered, compact = false }: RegisterLotFormProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [producers, setProducers] = useState<Producer[]>([]);
  const [orderId, setOrderId] = useState("");
  const [producerId, setProducerId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [createdLot, setCreatedLot] = useState<Lot | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [ordersRes, producersRes] = await Promise.all([
          apiFetch<{ orders: Order[] }>("/orders"),
          apiFetch<{ producers: Producer[] }>("/users/producers"),
        ]);
        if (cancelled) return;

        const eligible = ordersRes.orders.filter(o => ORDERS_ACCEPTING_LOTS.has(o.status));
        setOrders(eligible);
        setProducers(producersRes.producers);

        const defaultOrder = eligible.find(o => o.externalRef === DEMO_ORDER_REF) ?? eligible[0] ?? null;
        const defaultProducer =
          producersRes.producers.find(p => p.email === DEMO_PRODUCER_EMAIL) ?? producersRes.producers[0] ?? null;

        if (defaultOrder) setOrderId(defaultOrder.id);
        if (defaultProducer) setProducerId(defaultProducer.id);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "No se pudieron cargar órdenes o productores");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedOrder = useMemo(() => orders.find(o => o.id === orderId) ?? null, [orders, orderId]);

  const submit = async () => {
    if (!orderId || !producerId) return;
    setBusy(true);
    setError("");
    setCreatedLot(null);
    try {
      const lot = await apiFetch<Lot>("/lots", {
        method: "POST",
        body: { orderId, producerId },
      });
      setCreatedLot(lot);
      onRegistered?.(lot);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar el lote");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <section className="alp-panel">
        <p className="alp-muted">Cargando formulario de registro…</p>
      </section>
    );
  }

  return (
    <section className="alp-panel">
      <h2 className="alp-title" style={{ fontSize: compact ? "1.1rem" : "1.25rem" }}>
        Registrar lote
      </h2>
      {!compact ? (
        <p className="alp-subtitle" style={{ marginTop: "0.35rem" }}>
          Vincula fibra de un productor a una orden fondeada. El inspector verá el lote como pendiente de inspección.
        </p>
      ) : null}

      {error ? <ErrorBanner message={error} onDismiss={() => setError("")} /> : null}

      {!orders.length ? (
        <p className="alp-muted">No hay órdenes fondeadas que acepten lotes. Fondea ALP-2026-001 primero.</p>
      ) : !producers.length ? (
        <p className="alp-muted">No hay productores en el sistema.</p>
      ) : (
        <form
          className="alp-form"
          style={{ marginTop: compact ? "0.75rem" : "1rem" }}
          onSubmit={e => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="alp-field">
            <label htmlFor="register-order">Orden</label>
            <select id="register-order" value={orderId} onChange={e => setOrderId(e.target.value)} required>
              {orders.map(order => (
                <option key={order.id} value={order.id}>
                  {order.externalRef ?? order.id.slice(0, 8)} — {order.status.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </div>
          <div className="alp-field">
            <label htmlFor="register-producer">Productor</label>
            <select id="register-producer" value={producerId} onChange={e => setProducerId(e.target.value)} required>
              {producers.map(producer => (
                <option key={producer.id} value={producer.id}>
                  {producer.name} ({producer.email})
                </option>
              ))}
            </select>
          </div>
          {selectedOrder ? (
            <p className="alp-muted" style={{ margin: 0 }}>
              Saldo disponible en orden: {formatEscrowUsd(selectedOrder.remainingUsdcUnits)}
            </p>
          ) : null}
          <button type="submit" className="alp-btn alp-btn--primary" disabled={busy || !orderId || !producerId}>
            {busy ? "Registrando…" : "Registrar lote"}
          </button>
        </form>
      )}

      {createdLot ? (
        <div className="alp-note" style={{ marginTop: "1rem" }}>
          <p style={{ margin: "0 0 0.5rem" }}>
            Lote creado · <StatusPill status={createdLot.status} />
          </p>
          <p className="alp-muted" style={{ margin: "0 0 0.5rem" }}>
            ID: {createdLot.id}
          </p>
          <Link href={`/inspector/lots/${createdLot.id}/inspect`} className="alp-link-btn">
            Ir a inspeccionar →
          </Link>
        </div>
      ) : null}
    </section>
  );
}
