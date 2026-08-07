"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CampaignDetails } from "./CampaignDetails";
import { ErrorBanner } from "./ErrorBanner";
import { PricingPolicyHelpButton } from "./PricingPolicyHelp";
import { Button } from "~~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~~/components/ui/card";
import { Field, FieldLabel } from "~~/components/ui/field";
import { Input } from "~~/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~~/components/ui/select";
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
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Cargando formulario…</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Datos de la orden</CardTitle>
        <p className="text-sm text-muted-foreground">
          Indica cuántos kg quieres asegurar. El presupuesto se calcula con la política de la campaña.
        </p>
      </CardHeader>
      <CardContent>
        {error ? <ErrorBanner message={error} onDismiss={() => setError("")} /> : null}

        {!campaigns.length ? (
          <p className="text-sm text-muted-foreground">
            No hay campañas activas.{" "}
            <Link href="/buyer/campaigns/new" className="text-primary hover:underline">
              Crear una campaña →
            </Link>
          </p>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={e => {
              e.preventDefault();
              void submit();
            }}
          >
            <Field>
              <FieldLabel htmlFor="create-order-campaign">Campaña</FieldLabel>
              <Select value={campaignId} onValueChange={setCampaignId}>
                <SelectTrigger id="create-order-campaign" className="w-full">
                  <SelectValue placeholder="Selecciona una campaña" />
                </SelectTrigger>
                <SelectContent>
                  {campaigns.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                      {c.associationName ? ` · ${c.associationName}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                <Link href="/buyer/campaigns" className="text-primary hover:underline">
                  Ver / crear campañas
                </Link>
              </p>
            </Field>

            {selectedCampaign ? <CampaignDetails campaign={selectedCampaign} compact /> : null}

            <Field>
              <FieldLabel htmlFor="create-order-ref">Referencia</FieldLabel>
              <Input
                id="create-order-ref"
                type="text"
                value={externalRef}
                onChange={e => setExternalRef(e.target.value)}
                placeholder={suggestedRef}
                maxLength={64}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="create-order-kg">Meta de fibra (kg)</FieldLabel>
              <Input
                id="create-order-kg"
                type="number"
                min={0.1}
                step={0.1}
                inputMode="decimal"
                value={targetKg}
                onChange={e => setTargetKg(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Cantidad que quieres cubrir con fondos reservados. Los lotes se irán descontando de este tope.
              </p>
            </Field>

            {estimate && selectedCampaign?.pricing ? (
              <div className="rounded-lg border border-border bg-muted/40 p-4">
                <div className="flex items-center gap-1.5 mb-3">
                  <strong className="text-sm">Qué vas a fondear (en vivo)</strong>
                  <PricingPolicyHelpButton policy={selectedCampaign.pricing} />
                </div>
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">Categoría de cálculo</dt>
                    <dd className="font-medium">
                      {estimate.category.label} ({estimate.category.code})
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Precio</dt>
                    <dd className="font-medium">{estimate.pricePerKgLabel} / kg</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Bruto ({targetKg} kg)</dt>
                    <dd className="font-medium">{formatPen(estimate.grossPenMinor)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Comisión asociación ({estimate.feePct}%)</dt>
                    <dd className="font-medium">− {formatPen(estimate.feePenMinor)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Comisión plataforma ({estimate.platformFeePct}%)</dt>
                    <dd className="font-medium">− {formatPen(estimate.platformFeePenMinor)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Neto productor (estimado)</dt>
                    <dd className="font-medium">{formatPen(estimate.netPenMinor)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Tipo de cambio (demo)</dt>
                    <dd className="font-medium">S/ {estimate.fx} por USD</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">A depositar en cuenta de garantía</dt>
                    <dd className="font-semibold text-primary">
                      {formatUsdCents(estimate.budgetUsdCents)}{" "}
                      <span className="font-normal text-muted-foreground">
                        ({formatEscrowUsd(estimate.escrowUsdcUnits)})
                      </span>
                    </dd>
                  </div>
                </dl>
                <p className="mt-3 text-xs text-muted-foreground">
                  Estimado a precio <strong>{estimate.category.code}</strong>. Si el inspector clasifica otra categoría
                  o llega menos peso, puede sobrar saldo; si llega de más, la cuenta de garantía no permite pasarse del
                  tope.
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Elige una campaña con política de precios e ingresa kg para ver el desglose.
              </p>
            )}

            <Button type="submit" disabled={busy || !campaignId || !estimate}>
              {busy
                ? "Creando…"
                : estimate
                  ? `Crear orden · ${formatUsdCents(estimate.budgetUsdCents)}`
                  : "Crear orden"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
