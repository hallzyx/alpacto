"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ErrorBanner, RequireAuth, Skeleton, StatusPill } from "~~/components/alpacto";
import { apiFetch } from "~~/lib/api";
import { formatUsdCents } from "~~/lib/format";
import type { Campaign, Lot, Order } from "~~/lib/types";

type FundingStatus = {
  orderId: string;
  orderStatus: string;
  fundedUsdcUnits: string;
  remainingUsdcUnits: string;
  intent: { status: string } | null;
};

type PricingPolicy = {
  id: string;
  categories: Array<{
    code: string;
    label: string;
    pricePenMinorPerKg: string;
    qualityBonusPenMinorPerKg: string;
  }>;
};

function BuyerOrderInner() {
  const params = useParams();
  const id = String(params.id);
  const [order, setOrder] = useState<Order | null>(null);
  const [lots, setLots] = useState<Lot[]>([]);
  const [policy, setPolicy] = useState<PricingPolicy | null>(null);
  const [funding, setFunding] = useState<FundingStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError("");
    try {
      const o = await apiFetch<Order>(`/orders/${id}`);
      setOrder(o);
      const [lotsRes, status] = await Promise.all([
        apiFetch<{ lots: Lot[] }>(`/lots?orderId=${id}`),
        apiFetch<FundingStatus>(`/orders/${id}/funding-status`),
      ]);
      setLots(lotsRes.lots);
      setFunding(status);

      try {
        const campaign = await apiFetch<Campaign>(`/campaigns/${o.campaignId}`);
        const p = await apiFetch<PricingPolicy>(`/pricing-policies/${campaign.pricingPolicyId}`);
        setPolicy(p);
      } catch {
        setPolicy(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la orden");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!order) return;
    if (!["payment_pending", "funding"].includes(order.status) && funding?.intent?.status !== "pending") {
      return;
    }
    const t = setInterval(() => {
      void load();
    }, 4000);
    return () => clearInterval(t);
  }, [order, funding?.intent?.status, load]);

  const fund = async () => {
    setBusy(true);
    setError("");
    try {
      const session = await apiFetch<{ url: string | null }>(`/orders/${id}/funding-session`, {
        method: "POST",
        body: {},
      });
      if (session.url) {
        window.open(session.url, "_blank", "noopener,noreferrer");
      } else {
        setError("Sesión de pago creada, pero sin URL (revisa Stripe).");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar el fondeo");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Skeleton rows={6} />;
  if (!order) return <ErrorBanner message={error || "Orden no encontrada"} />;

  return (
    <div className="alp-page">
      <div>
        <Link href="/buyer/orders" className="alp-link-btn">
          ← Órdenes
        </Link>
        <h1 className="alp-title" style={{ marginTop: "0.75rem" }}>
          {order.externalRef ?? `Orden ${order.id.slice(0, 8)}`}
        </h1>
        <div style={{ marginTop: "0.5rem" }}>
          <StatusPill status={funding?.orderStatus ?? order.status} />
        </div>
      </div>

      {error ? <ErrorBanner message={error} onDismiss={() => setError("")} /> : null}

      <div className="alp-panel">
        <dl className="alp-kv">
          <dt>Presupuesto</dt>
          <dd>{formatUsdCents(order.budgetUsdCents)}</dd>
          <dt>Fondeado (USDC units)</dt>
          <dd>{funding?.fundedUsdcUnits ?? order.fundedUsdcUnits}</dd>
          <dt>Restante</dt>
          <dd>{funding?.remainingUsdcUnits ?? order.remainingUsdcUnits}</dd>
        </dl>
        {["draft", "payment_pending"].includes(order.status) ? (
          <div className="alp-actions" style={{ marginTop: "1rem" }}>
            <button type="button" className="alp-btn alp-btn--primary" disabled={busy} onClick={() => void fund()}>
              {busy ? "Abriendo…" : "Financiar orden"}
            </button>
          </div>
        ) : null}
        {funding?.intent ? (
          <p className="alp-muted" style={{ marginBottom: 0, marginTop: "0.75rem" }}>
            Intent: <StatusPill status={funding.intent.status} />
          </p>
        ) : null}
      </div>

      {policy ? (
        <div className="alp-panel">
          <h2 className="alp-title" style={{ fontSize: "1.25rem" }}>
            Tabla de precios
          </h2>
          <div className="alp-list">
            {policy.categories.map(cat => (
              <div key={cat.code} className="alp-lot-row" style={{ padding: "0.25rem 0" }}>
                <span className="alp-lot-row__id">
                  {cat.label} ({cat.code})
                </span>
                <span className="alp-muted">
                  {(Number(cat.pricePenMinorPerKg) / 100).toFixed(2)} + prima{" "}
                  {(Number(cat.qualityBonusPenMinorPerKg) / 100).toFixed(2)} / kg
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="alp-panel">
        <h2 className="alp-title" style={{ fontSize: "1.25rem" }}>
          Lotes
        </h2>
        {!lots.length ? (
          <p className="alp-muted">Sin lotes vinculados.</p>
        ) : (
          <div className="alp-list">
            {lots.map(lot => (
              <div key={lot.id} className="alp-lot-row" style={{ padding: "0.25rem 0" }}>
                <span className="alp-lot-row__id">{lot.id.slice(0, 8)}</span>
                <StatusPill status={lot.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function BuyerOrderPage() {
  return (
    <RequireAuth roles={["buyer", "admin"]}>
      <BuyerOrderInner />
    </RequireAuth>
  );
}
