"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CampaignDetails } from "./CampaignDetails";
import { ErrorBanner } from "./ErrorBanner";
import { PricingPolicyHelpButton } from "./PricingPolicyHelp";
import { apiFetch } from "~~/lib/api";
import { formatEscrowUsd, formatPen, formatUsdCents } from "~~/lib/format";
import type { Campaign, Order, PricingPolicy } from "~~/lib/types";

const DEMO_CAMPAIGN_NAME = "Campaña Demo 2026";
const DEMO_MAX_USD = 10_000;
/** Demo default aligned with typical lot size in the script. */
const DEFAULT_TARGET_KG = "50";

type CreateOrderFormProps = {
  existingOrders?: Order[];
  onCreated?: (order: Order) => void;
  redirectToDetail?: boolean;
};

function suggestExternalRef(orders: Order[]): string {
  const year = new Date().getFullYear();
  const prefix = `ALP-${year}-`;
  const refPattern = new RegExp("^ALP-\\d{4}-(\\d+)$");
  const numbers = orders
    .map(o => o.externalRef?.match(refPattern)?.[1])
    .filter(Boolean)
    .map(n => Number(n));
  const next = numbers.length ? Math.max(...numbers) + 1 : 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

function kgToGrams(kg: string): number | null {
  const n = Number(kg);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 1000);
}

/** Client-side mirror of domain estimate (integer-ish via Number for UI). */
function estimateFromPolicy(kg: string, policy: PricingPolicy | null | undefined) {
  const grams = kgToGrams(kg);
  if (grams == null || !policy) return null;

  const fine = policy.categories.find(c => c.code.toUpperCase() === "FINE") ?? policy.categories[0] ?? null;
  if (!fine) return null;

  const price = Number(fine.pricePenMinorPerKg);
  const bonus = Number(fine.qualityBonusPenMinorPerKg);
  const fxMicros = Number(policy.penPerUsdcMicros);
  if (!Number.isFinite(price) || !Number.isFinite(fxMicros) || fxMicros <= 0) return null;

  const grossPenMinor = Math.floor((grams * price) / 1000) + Math.floor((grams * bonus) / 1000);
  const feePenMinor = Math.floor((grossPenMinor * policy.associationFeeBps) / 10_000);
  const platformFeeBps = policy.platformFeeBps ?? 50;
  const platformFeePenMinor = Math.floor((grossPenMinor * platformFeeBps) / 10_000);
  const netPenMinor = grossPenMinor - feePenMinor - platformFeePenMinor;
  // Escrow covers full gross converted to USDC (producer + association + platform).
  const escrowUsdcUnits = Math.floor((grossPenMinor * 1_000_000 * 1_000_000) / (fxMicros * 100));
  const budgetUsdCents = Math.max(1, Math.ceil(escrowUsdcUnits / 10_000));
  const feePct = (policy.associationFeeBps / 100).toFixed(1);
  const platformFeePct = (platformFeeBps / 100).toFixed(1);
  const fx = (fxMicros / 1_000_000).toFixed(2);

  return {
    category: fine,
    grams,
    grossPenMinor,
    feePenMinor,
    platformFeePenMinor,
    netPenMinor,
    escrowUsdcUnits,
    budgetUsdCents,
    feePct,
    platformFeePct,
    fx,
    pricePerKgLabel: formatPen(fine.pricePenMinorPerKg),
  };
}

export function CreateOrderForm({ existingOrders = [], onCreated, redirectToDetail = true }: CreateOrderFormProps) {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [externalRef, setExternalRef] = useState("");
  const [targetKg, setTargetKg] = useState(DEFAULT_TARGET_KG);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const suggestedRef = useMemo(() => suggestExternalRef(existingOrders), [existingOrders]);
  const selectedCampaign = useMemo(() => campaigns.find(c => c.id === campaignId) ?? null, [campaigns, campaignId]);

  const estimate = useMemo(() => estimateFromPolicy(targetKg, selectedCampaign?.pricing), [targetKg, selectedCampaign]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch<{ campaigns: Campaign[] }>("/campaigns");
        if (cancelled) return;
        const active = data.campaigns.filter(c => c.status === "active");
        const list = active.length ? active : data.campaigns;
        setCampaigns(list);
        const defaultCampaign = list.find(c => c.name === DEMO_CAMPAIGN_NAME) ?? list[0] ?? null;
        if (defaultCampaign) setCampaignId(defaultCampaign.id);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "No se pudieron cargar campañas");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!externalRef && suggestedRef) setExternalRef(suggestedRef);
  }, [suggestedRef, externalRef]);

  const submit = async () => {
    if (!campaignId) return;
    if (!estimate) {
      setError("Ingresa kg válidos y elige una campaña con política de precios.");
      return;
    }
    if (estimate.budgetUsdCents / 100 > DEMO_MAX_USD) {
      setError("En demo el máximo es $" + DEMO_MAX_USD.toLocaleString("en-US") + " USD. Reduce los kg.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const order = await apiFetch<Order>("/orders", {
        method: "POST",
        body: {
          campaignId,
          externalRef: externalRef.trim() || suggestedRef,
          targetWeightGrams: String(estimate.grams),
        },
      });
      onCreated?.(order);
      if (redirectToDetail) {
        router.push("/buyer/orders/" + order.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la orden");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <section className="alp-panel">
        <p className="alp-muted">Cargando formulario…</p>
      </section>
    );
  }

  return (
    <section className="alp-panel">
      <h2 className="alp-title" style={{ fontSize: "1.25rem" }}>
        Nueva orden
      </h2>
      <p className="alp-subtitle" style={{ marginTop: "0.35rem" }}>
        Indica cuántos kg quieres asegurar. El presupuesto a fondear se calcula con la política de la campaña (precio
        FINE, comisión y tipo de cambio).
      </p>

      {error ? <ErrorBanner message={error} onDismiss={() => setError("")} /> : null}

      {!campaigns.length ? (
        <p className="alp-muted">
          No hay campañas activas.{" "}
          <Link href="/buyer/campaigns" className="alp-link-btn">
            Crear una campaña →
          </Link>
        </p>
      ) : (
        <form
          className="alp-form"
          style={{ marginTop: "1rem" }}
          onSubmit={e => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="alp-field">
            <label htmlFor="create-order-campaign">Campaña</label>
            <select
              id="create-order-campaign"
              value={campaignId}
              onChange={e => setCampaignId(e.target.value)}
              required
            >
              {campaigns.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.associationName ? ` · ${c.associationName}` : ""}
                </option>
              ))}
            </select>
            <p className="alp-muted" style={{ margin: "0.35rem 0 0", fontSize: "0.85rem" }}>
              <Link href="/buyer/campaigns" className="alp-link-btn">
                Ver / crear campañas
              </Link>
            </p>
          </div>

          {selectedCampaign ? <CampaignDetails campaign={selectedCampaign} compact /> : null}

          <div className="alp-field">
            <label htmlFor="create-order-ref">Referencia</label>
            <input
              id="create-order-ref"
              type="text"
              value={externalRef}
              onChange={e => setExternalRef(e.target.value)}
              placeholder={suggestedRef}
              maxLength={64}
            />
          </div>

          <div className="alp-field">
            <label htmlFor="create-order-kg">Meta de fibra (kg)</label>
            <input
              id="create-order-kg"
              type="number"
              min={0.1}
              step={0.1}
              inputMode="decimal"
              value={targetKg}
              onChange={e => setTargetKg(e.target.value)}
              required
            />
            <p className="alp-muted" style={{ margin: "0.35rem 0 0", fontSize: "0.85rem" }}>
              Cantidad que quieres cubrir con el escrow. Los lotes se irán descontando de este tope.
            </p>
          </div>

          {estimate && selectedCampaign?.pricing ? (
            <div className="alp-note" style={{ marginTop: "0.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", marginBottom: "0.5rem" }}>
                <strong style={{ fontSize: "0.95rem" }}>Qué vas a fondear (en vivo)</strong>
                <PricingPolicyHelpButton policy={selectedCampaign.pricing} />
              </div>
              <dl className="alp-kv" style={{ fontSize: "0.9rem", margin: 0 }}>
                <dt>Categoría de cálculo</dt>
                <dd>
                  {estimate.category.label} ({estimate.category.code})
                </dd>
                <dt>Precio</dt>
                <dd>{estimate.pricePerKgLabel} / kg</dd>
                <dt>Bruto ({targetKg} kg)</dt>
                <dd>{formatPen(estimate.grossPenMinor)}</dd>
                <dt>Comisión asociación ({estimate.feePct}%)</dt>
                <dd>− {formatPen(estimate.feePenMinor)}</dd>
                <dt>Comisión plataforma ({estimate.platformFeePct}%)</dt>
                <dd>− {formatPen(estimate.platformFeePenMinor)}</dd>
                <dt>Neto productor (estimado)</dt>
                <dd>{formatPen(estimate.netPenMinor)}</dd>
                <dt>Tipo de cambio (demo)</dt>
                <dd>S/ {estimate.fx} por USD</dd>
                <dt>A fondear en escrow</dt>
                <dd style={{ fontWeight: 700 }}>
                  {formatUsdCents(estimate.budgetUsdCents)}{" "}
                  <span className="alp-muted" style={{ fontWeight: 400 }}>
                    ({formatEscrowUsd(estimate.escrowUsdcUnits)})
                  </span>
                </dd>
              </dl>
              <p className="alp-muted" style={{ margin: "0.65rem 0 0", fontSize: "0.85rem" }}>
                Estimado a precio <strong>{estimate.category.code}</strong>. Si el inspector clasifica otra categoría o
                llega menos peso, puede sobrar saldo; si llega de más, el escrow no permite pasarse del tope.
              </p>
            </div>
          ) : (
            <p className="alp-muted" style={{ marginTop: "0.5rem" }}>
              Elige una campaña con política de precios e ingresa kg para ver el desglose.
            </p>
          )}

          <button
            type="submit"
            className="alp-btn alp-btn--primary"
            disabled={busy || !campaignId || !estimate}
            style={{ marginTop: "0.75rem" }}
          >
            {busy ? "Creando…" : estimate ? `Crear orden · ${formatUsdCents(estimate.budgetUsdCents)}` : "Crear orden"}
          </button>
        </form>
      )}
    </section>
  );
}
