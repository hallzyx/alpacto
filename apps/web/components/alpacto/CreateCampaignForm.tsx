"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { ErrorBanner } from "./ErrorBanner";
import { PricingPolicyPreview } from "./PricingPolicyHelp";
import { Button } from "~~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~~/components/ui/card";
import { Field, FieldLabel } from "~~/components/ui/field";
import { Input } from "~~/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~~/components/ui/select";
import { apiFetch } from "~~/lib/api";
import type { Campaign, Organization, PricingPolicy } from "~~/lib/types";

type BuyerOption = { id: string; email: string; name: string };

type CreateCampaignFormProps = {
  onCreated?: (campaign: Campaign) => void;
};

export function CreateCampaignForm({ onCreated }: CreateCampaignFormProps) {
  const { user } = useAuth();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [policies, setPolicies] = useState<PricingPolicy[]>([]);
  const [buyers, setBuyers] = useState<BuyerOption[]>([]);
  const [name, setName] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [pricingPolicyId, setPricingPolicyId] = useState("");
  const [buyerId, setBuyerId] = useState("");
  const [startDate, setStartDate] = useState(() => `${new Date().getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(() => `${new Date().getFullYear()}-12-31`);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const needsBuyerPicker = user?.role === "association" || user?.role === "admin";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const requests: [
          Promise<{ organizations: Organization[] }>,
          Promise<{ policies: PricingPolicy[] }>,
          Promise<{ buyers: BuyerOption[] }> | null,
        ] = [
          apiFetch<{ organizations: Organization[] }>("/organizations?type=association"),
          apiFetch<{ policies: PricingPolicy[] }>("/pricing-policies"),
          needsBuyerPicker ? apiFetch<{ buyers: BuyerOption[] }>("/users/buyers") : null,
        ];
        const [orgRes, policyRes, buyerRes] = await Promise.all([
          requests[0],
          requests[1],
          requests[2] ?? Promise.resolve({ buyers: [] as BuyerOption[] }),
        ]);
        if (cancelled) return;
        setOrgs(orgRes.organizations);
        setPolicies(policyRes.policies);
        setBuyers(buyerRes.buyers);
        if (orgRes.organizations[0]) setOrganizationId(orgRes.organizations[0].id);
        if (policyRes.policies[0]) setPricingPolicyId(policyRes.policies[0].id);
        if (buyerRes.buyers[0]) setBuyerId(buyerRes.buyers[0].id);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "No se pudieron cargar asociaciones o políticas");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [needsBuyerPicker]);

  const selectedPolicy = policies.find(p => p.id === pricingPolicyId) ?? null;

  const submit = async () => {
    if (!organizationId || !pricingPolicyId || !name.trim()) return;
    if (needsBuyerPicker && !buyerId) {
      setError("Selecciona un comprador para la campaña.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const campaign = await apiFetch<Campaign>("/campaigns", {
        method: "POST",
        body: {
          name: name.trim(),
          organizationId,
          pricingPolicyId,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          ...(needsBuyerPicker ? { buyerId } : {}),
        },
      });
      setName("");
      onCreated?.(campaign);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la campaña");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Cargando formulario de campaña…</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Datos de la campaña</CardTitle>
        <p className="text-sm text-muted-foreground">Asociación, comprador, política de precios y ventana de tiempo.</p>
      </CardHeader>
      <CardContent>
        {error ? <ErrorBanner message={error} onDismiss={() => setError("")} /> : null}

        {!orgs.length || !policies.length ? (
          <p className="text-sm text-muted-foreground">
            Falta seed de asociación o política de precios. Ejecuta <code>yarn db:seed</code>.
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
              <FieldLabel htmlFor="campaign-name">Nombre</FieldLabel>
              <Input
                id="campaign-name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Campaña Arequipa 2026"
                required
                maxLength={255}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="campaign-org">Asociación</FieldLabel>
              <Select value={organizationId} onValueChange={setOrganizationId}>
                <SelectTrigger id="campaign-org" className="w-full">
                  <SelectValue placeholder="Selecciona una asociación" />
                </SelectTrigger>
                <SelectContent>
                  {orgs.map(o => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {needsBuyerPicker ? (
              <Field>
                <FieldLabel htmlFor="campaign-buyer">Comprador</FieldLabel>
                <Select value={buyerId} onValueChange={setBuyerId}>
                  <SelectTrigger id="campaign-buyer" className="w-full">
                    <SelectValue placeholder="Selecciona un comprador" />
                  </SelectTrigger>
                  <SelectContent>
                    {buyers.map(b => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name} ({b.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}

            <Field>
              <FieldLabel htmlFor="campaign-policy">Política de precios</FieldLabel>
              <Select value={pricingPolicyId} onValueChange={setPricingPolicyId}>
                <SelectTrigger id="campaign-policy" className="w-full">
                  <SelectValue placeholder="Selecciona una política" />
                </SelectTrigger>
                <SelectContent>
                  {policies.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      v{p.version} · fee {(p.associationFeeBps / 100).toFixed(1)}% ·{" "}
                      {p.categories.map(c => c.code).join(", ") || "sin categorías"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {selectedPolicy ? <PricingPolicyPreview policy={selectedPolicy} /> : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="campaign-start">Inicio</FieldLabel>
                <Input id="campaign-start" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="campaign-end">Fin</FieldLabel>
                <Input id="campaign-end" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
              </Field>
            </div>

            <Button type="submit" disabled={busy || !name.trim() || !organizationId || !pricingPolicyId}>
              {busy ? "Creando…" : "Crear campaña"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
