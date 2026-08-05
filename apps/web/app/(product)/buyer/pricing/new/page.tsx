"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ErrorBanner, RequireAuth } from "~~/components/alpacto";
import { Button } from "~~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~~/components/ui/card";
import { Field, FieldLabel } from "~~/components/ui/field";
import { Input } from "~~/components/ui/input";
import { apiFetch } from "~~/lib/api";
import type { PricingPolicy } from "~~/lib/types";

type CategoryDraft = {
  code: string;
  label: string;
  pricePenPerKg: string;
  qualityBonusPenPerKg: string;
};

const DEFAULT_CATEGORIES: CategoryDraft[] = [
  { code: "FINE", label: "Fino", pricePenPerKg: "27.50", qualityBonusPenPerKg: "0" },
  { code: "MEDIUM", label: "Medio", pricePenPerKg: "23.00", qualityBonusPenPerKg: "0" },
  { code: "COARSE", label: "Grueso", pricePenPerKg: "18.50", qualityBonusPenPerKg: "0" },
];

function NewPricingPolicyInner() {
  const router = useRouter();
  const [associationFeePercent, setAssociationFeePercent] = useState("3");
  const [weightTolerancePercent, setWeightTolerancePercent] = useState("1");
  const [penPerUsdc, setPenPerUsdc] = useState("3.75");
  const [categories, setCategories] = useState<CategoryDraft[]>(DEFAULT_CATEGORIES);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const updateCategory = (index: number, patch: Partial<CategoryDraft>) => {
    setCategories(prev => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  };

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const policy = await apiFetch<PricingPolicy>("/pricing-policies", {
        method: "POST",
        body: {
          associationFeePercent: Number(associationFeePercent),
          weightTolerancePercent: Number(weightTolerancePercent),
          penPerUsdc: Number(penPerUsdc),
          categories: categories.map(c => ({
            code: c.code.trim().toUpperCase(),
            label: c.label.trim(),
            pricePenPerKg: Number(c.pricePenPerKg),
            qualityBonusPenPerKg: Number(c.qualityBonusPenPerKg || 0),
          })),
        },
      });
      router.push(`/buyer/pricing?created=${policy.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la política");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/buyer/pricing"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Políticas
        </Link>
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
            Nueva política de precios
          </h1>
          <p className="text-muted-foreground">
            Se crea como nueva versión. Luego podrás adjuntarla a una campaña (y a las órdenes de esa campaña).
          </p>
        </div>
      </div>

      {error ? <ErrorBanner message={error} onDismiss={() => setError("")} /> : null}

      <form
        className="grid gap-6"
        onSubmit={e => {
          e.preventDefault();
          void submit();
        }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Condiciones generales</CardTitle>
            <CardDescription>
              Comisión de asociación, tolerancia Ayni y tasa demo PEN/USD. La comisión de plataforma queda en 0.5%.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="assoc-fee">Comisión asociación (%)</FieldLabel>
              <Input
                id="assoc-fee"
                inputMode="decimal"
                value={associationFeePercent}
                onChange={e => setAssociationFeePercent(e.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="tol">Tolerancia peso Ayni (%)</FieldLabel>
              <Input
                id="tol"
                inputMode="decimal"
                value={weightTolerancePercent}
                onChange={e => setWeightTolerancePercent(e.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="fx">Soles por USD (demo)</FieldLabel>
              <Input
                id="fx"
                inputMode="decimal"
                value={penPerUsdc}
                onChange={e => setPenPerUsdc(e.target.value)}
                required
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Categorías de calidad</CardTitle>
            <CardDescription>
              Precio en soles por kg. El inspector elegirá una de estas al pesar el lote.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {categories.map((cat, i) => (
              <div
                key={cat.code}
                className="grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-[7rem_1fr_8rem_8rem]"
              >
                <Field>
                  <FieldLabel>Código</FieldLabel>
                  <Input value={cat.code} readOnly className="bg-muted/40" />
                </Field>
                <Field>
                  <FieldLabel>Etiqueta</FieldLabel>
                  <Input value={cat.label} onChange={e => updateCategory(i, { label: e.target.value })} required />
                </Field>
                <Field>
                  <FieldLabel>Precio S/ / kg</FieldLabel>
                  <Input
                    inputMode="decimal"
                    value={cat.pricePenPerKg}
                    onChange={e => updateCategory(i, { pricePenPerKg: e.target.value })}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel>Prima S/ / kg</FieldLabel>
                  <Input
                    inputMode="decimal"
                    value={cat.qualityBonusPenPerKg}
                    onChange={e => updateCategory(i, { qualityBonusPenPerKg: e.target.value })}
                  />
                </Field>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={busy}>
            {busy ? "Creando…" : "Crear política"}
          </Button>
          <Button asChild type="button" variant="outline">
            <Link href="/buyer/pricing">Cancelar</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function NewPricingPolicyPage() {
  return (
    <RequireAuth roles={["buyer", "admin"]}>
      <NewPricingPolicyInner />
    </RequireAuth>
  );
}
