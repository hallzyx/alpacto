"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { ErrorBanner } from "./ErrorBanner";
import { PricingPolicyPreview } from "./PricingPolicyHelp";
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
      <section className="alp-panel">
        <p className="alp-muted">Cargando formulario de campaña…</p>
      </section>
    );
  }

  return (
    <section className="alp-panel">
      <h2 className="alp-title" style={{ fontSize: "1.25rem" }}>
        Nueva campaña
      </h2>
      <p className="alp-subtitle" style={{ marginTop: "0.35rem" }}>
        Define el marco comercial: asociación, ventana y tabla de precios. Las órdenes se crean después dentro de esta
        campaña.
      </p>

      {error ? <ErrorBanner message={error} onDismiss={() => setError("")} /> : null}

      {!orgs.length || !policies.length ? (
        <p className="alp-muted">
          Falta seed de asociación o política de precios. Ejecuta <code>yarn db:seed</code>.
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
            <label htmlFor="campaign-name">Nombre</label>
            <input
              id="campaign-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Campaña Arequipa 2026"
              required
              maxLength={255}
            />
          </div>
          <div className="alp-field">
            <label htmlFor="campaign-org">Asociación</label>
            <select id="campaign-org" value={organizationId} onChange={e => setOrganizationId(e.target.value)} required>
              {orgs.map(o => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
          {needsBuyerPicker ? (
            <div className="alp-field">
              <label htmlFor="campaign-buyer">Comprador</label>
              <select id="campaign-buyer" value={buyerId} onChange={e => setBuyerId(e.target.value)} required>
                {buyers.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.email})
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="alp-field">
            <label htmlFor="campaign-policy">Política de precios</label>
            <select
              id="campaign-policy"
              value={pricingPolicyId}
              onChange={e => setPricingPolicyId(e.target.value)}
              required
            >
              {policies.map(p => (
                <option key={p.id} value={p.id}>
                  v{p.version} · fee {(p.associationFeeBps / 100).toFixed(1)}% ·{" "}
                  {p.categories.map(c => c.code).join(", ") || "sin categorías"}
                </option>
              ))}
            </select>
          </div>
          {selectedPolicy ? <PricingPolicyPreview policy={selectedPolicy} /> : null}
          <div className="alp-field">
            <label htmlFor="campaign-start">Inicio</label>
            <input id="campaign-start" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div className="alp-field">
            <label htmlFor="campaign-end">Fin</label>
            <input id="campaign-end" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
          <button
            type="submit"
            className="alp-btn alp-btn--primary"
            disabled={busy || !name.trim() || !organizationId || !pricingPolicyId}
          >
            {busy ? "Creando…" : "Crear campaña"}
          </button>
        </form>
      )}
    </section>
  );
}
