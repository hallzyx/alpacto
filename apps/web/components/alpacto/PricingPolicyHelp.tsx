"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { IoClose, IoHelpCircleOutline } from "react-icons/io5";
import { formatPen } from "~~/lib/format";
import type { PricingPolicy } from "~~/lib/types";

/** Demo FX hardcoded in seed (`DEMO_PEN_PER_USDC_MICROS` / 1e6). */
export const DEMO_PEN_PER_USDC = 3.75;

type PricingPolicyHelpModalProps = {
  policy: PricingPolicy;
  open: boolean;
  onClose: () => void;
};

function formatFx(penPerUsdcMicros: string | null | undefined): string {
  const n = Number(penPerUsdcMicros);
  if (!Number.isFinite(n) || n <= 0) return DEMO_PEN_PER_USDC.toFixed(2);
  return (n / 1_000_000).toFixed(2);
}

function formatToleranceBps(bps: number): string {
  return (bps / 100).toFixed(1) + "%";
}

export function PricingPolicyHelpModal({ policy, open, onClose }: PricingPolicyHelpModalProps) {
  const [mounted, setMounted] = useState(false);

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = prev;
    };
  }, [open, handleKey]);

  if (!open || !mounted) return null;

  const feePct = (policy.associationFeeBps / 100).toFixed(1);
  const platformFeePct = ((policy.platformFeeBps ?? 50) / 100).toFixed(1);
  const fx = formatFx(policy.penPerUsdcMicros);
  const tolerance = formatToleranceBps(policy.weightToleranceBps);

  return createPortal(
    <div className="alp-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="alp-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pricing-policy-help-title"
        onClick={e => e.stopPropagation()}
      >
        <header className="alp-modal__header">
          <h2 id="pricing-policy-help-title" className="alp-title" style={{ fontSize: "1.2rem", margin: 0 }}>
            Política de precios v{policy.version}
          </h2>
          <button type="button" className="alp-modal__close" aria-label="Cerrar" onClick={onClose}>
            <IoClose size={22} />
          </button>
        </header>

        <p className="alp-muted" style={{ marginTop: "0.5rem", marginBottom: "1rem" }}>
          Define cómo se calcula el valor de cada lote al inspeccionar: precio por calidad, comisión de la asociación,
          conversión a dólares en cuenta de garantía y tolerancia para la auditoría Ayni.
        </p>

        <dl className="alp-policy-help">
          <div className="alp-policy-help__row">
            <dt>Versión</dt>
            <dd>
              <strong>v{policy.version}</strong>
              <span className="alp-policy-help__hint">
                Número de revisión de la tabla. Si cambian precios en el futuro, se crea v2 sin afectar campañas
                antiguas.
              </span>
            </dd>
          </div>
          <div className="alp-policy-help__row">
            <dt>Moneda</dt>
            <dd>
              <strong>{policy.currency}</strong>
              <span className="alp-policy-help__hint">
                Los precios por kg se expresan en soles peruanos (centavos internamente).
              </span>
            </dd>
          </div>
          <div className="alp-policy-help__row">
            <dt>Comisión asociación</dt>
            <dd>
              <strong>{feePct}%</strong>
              <span className="alp-policy-help__hint">
                Porcentaje que retiene la asociación sobre el valor bruto del lote. En demo: AlpaSur.
              </span>
            </dd>
          </div>
          <div className="alp-policy-help__row">
            <dt>Comisión plataforma</dt>
            <dd>
              <strong>{platformFeePct}%</strong>
              <span className="alp-policy-help__hint">
                Comisión de Alpacto sobre el valor bruto. Se aparta al liquidar cada lote.
              </span>
            </dd>
          </div>
          <div className="alp-policy-help__row">
            <dt>Tasa PEN / USD (demo)</dt>
            <dd>
              <strong>S/ {fx} = USD 1</strong>
              <span className="alp-policy-help__hint">
                Tasa fija del demo (equivalente a {DEMO_PEN_PER_USDC} soles por dólar). Convierte el neto en soles al
                saldo reservado de la orden. No es una cotización en tiempo real.
              </span>
            </dd>
          </div>
          <div className="alp-policy-help__row">
            <dt>Tolerancia de peso</dt>
            <dd>
              <strong>{tolerance}</strong>
              <span className="alp-policy-help__hint">
                Margen permitido entre el peso del inspector y la evidencia (Ayni). Si la diferencia supera esto, la
                auditoría pide revisión o nuevo pesaje.
              </span>
            </dd>
          </div>
        </dl>

        <section style={{ marginTop: "1rem" }}>
          <h3 className="alp-title" style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>
            Categorías de calidad
          </h3>
          <div className="alp-list">
            {policy.categories.map(cat => (
              <div key={cat.code} className="alp-policy-help__category">
                <div className="alp-lot-row__meta">
                  <span className="alp-lot-row__id">
                    {cat.label} ({cat.code})
                  </span>
                  <span>{formatPen(cat.pricePenMinorPerKg)} / kg</span>
                </div>
                <p className="alp-policy-help__hint" style={{ margin: "0.25rem 0 0" }}>
                  Precio base por kilogramo cuando el inspector clasifica el lote en esta categoría.
                  {Number(cat.qualityBonusPenMinorPerKg) > 0
                    ? ` Prima de calidad: ${formatPen(cat.qualityBonusPenMinorPerKg)} / kg adicional.`
                    : " Sin prima adicional en esta política."}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="alp-note" style={{ marginTop: "1rem" }}>
          <p style={{ margin: "0 0 0.35rem" }}>
            <strong>Ejemplo (41.5 kg FINE)</strong>
          </p>
          <p style={{ margin: 0 }}>
            Bruto ≈ 41.5 × precio/kg → menos {feePct}% comisión → neto en soles → convertido a USD en cuenta de garantía
            (S/ {fx}
            /USD). Ese saldo se descuenta de la orden al liquidar el lote.
          </p>
        </section>
      </div>
    </div>,
    document.body,
  );
}

type PricingPolicyHelpButtonProps = {
  policy: PricingPolicy;
  className?: string;
};

export function PricingPolicyHelpButton({ policy, className }: PricingPolicyHelpButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={className ?? "alp-help-btn"}
        aria-label="Explicación de la política de precios"
        onClick={() => setOpen(true)}
      >
        <IoHelpCircleOutline size={18} aria-hidden />
      </button>
      <PricingPolicyHelpModal policy={policy} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

type PricingPolicyPreviewProps = {
  policy: PricingPolicy;
};

export function PricingPolicyPreview({ policy }: PricingPolicyPreviewProps) {
  const fx = formatFx(policy.penPerUsdcMicros);

  return (
    <div className="alp-note">
      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", marginBottom: "0.35rem" }}>
        <p style={{ margin: 0 }}>Precios que aplicarán a las órdenes de esta campaña:</p>
        <PricingPolicyHelpButton policy={policy} />
      </div>
      <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
        {policy.categories.map(c => (
          <li key={c.code}>
            {c.label} ({c.code}): {formatPen(c.pricePenMinorPerKg)} / kg
          </li>
        ))}
        <li>
          Tasa demo: <strong>S/ {fx} por USD</strong>
        </li>
      </ul>
    </div>
  );
}
