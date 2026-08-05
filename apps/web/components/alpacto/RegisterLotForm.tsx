"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ErrorBanner, StatusPill } from "~~/components/alpacto";
import { Button } from "~~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~~/components/ui/card";
import { Field, FieldLabel } from "~~/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~~/components/ui/select";
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
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Cargando formulario de registro…</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className={compact ? "text-lg" : undefined}>Registrar lote</CardTitle>
        {!compact ? (
          <p className="text-sm text-muted-foreground">El inspector verá el lote como pendiente de inspección.</p>
        ) : null}
      </CardHeader>
      <CardContent>
        {error ? <ErrorBanner message={error} onDismiss={() => setError("")} /> : null}

        {!orders.length ? (
          <p className="text-sm text-muted-foreground">
            No hay órdenes fondeadas que acepten lotes. Fondea ALP-2026-001 primero.
          </p>
        ) : !producers.length ? (
          <p className="text-sm text-muted-foreground">No hay productores en el sistema.</p>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={e => {
              e.preventDefault();
              void submit();
            }}
          >
            <Field>
              <FieldLabel htmlFor="register-order">Orden</FieldLabel>
              <Select value={orderId} onValueChange={setOrderId}>
                <SelectTrigger id="register-order" className="w-full">
                  <SelectValue placeholder="Selecciona una orden" />
                </SelectTrigger>
                <SelectContent>
                  {orders.map(order => (
                    <SelectItem key={order.id} value={order.id}>
                      {order.externalRef ?? order.id.slice(0, 8)} — {order.status.replaceAll("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="register-producer">Productor</FieldLabel>
              <Select value={producerId} onValueChange={setProducerId}>
                <SelectTrigger id="register-producer" className="w-full">
                  <SelectValue placeholder="Selecciona un productor" />
                </SelectTrigger>
                <SelectContent>
                  {producers.map(producer => (
                    <SelectItem key={producer.id} value={producer.id}>
                      {producer.name} ({producer.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {selectedOrder ? (
              <p className="text-sm text-muted-foreground">
                Saldo disponible en orden: {formatEscrowUsd(selectedOrder.remainingUsdcUnits)}
              </p>
            ) : null}

            <Button type="submit" disabled={busy || !orderId || !producerId}>
              {busy ? "Registrando…" : "Registrar lote"}
            </Button>
          </form>
        )}

        {createdLot ? (
          <div className="mt-4 rounded-lg border border-border bg-muted/50 p-4">
            <p className="flex items-center gap-2 text-sm font-medium">
              Lote creado <StatusPill status={createdLot.status} />
            </p>
            <p className="mt-1 text-sm text-muted-foreground">ID: {createdLot.id}</p>
            <Button asChild variant="link" className="mt-2 h-auto p-0">
              <Link href={`/inspector/lots/${createdLot.id}/inspect`}>Ir a inspeccionar →</Link>
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
