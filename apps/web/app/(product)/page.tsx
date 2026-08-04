"use client";

import { useState } from "react";
import Link from "next/link";
import { ErrorBanner, useAuth } from "~~/components/alpacto";

const DEMO_ROLES = [
  { email: "andes@demo.alpacto", label: "Comprador", role: "buyer" },
  { email: "carlos@demo.alpacto", label: "Inspector", role: "inspector" },
  { email: "alpasur@demo.alpacto", label: "Asociación", role: "association" },
  { email: "admin@demo.alpacto", label: "Admin", role: "admin" },
] as const;

export default function LandingPage() {
  const { demoLogin, user, goHome } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const onDemo = async (email: string) => {
    setError("");
    setBusy(email);
    try {
      await demoLogin(email);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión demo");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="alp-hero">
      <h1 className="alp-hero__brand">Alpacto</h1>
      <p className="alp-hero__tagline">Un pacto justo por cada fibra.</p>

      {error ? <ErrorBanner message={error} onDismiss={() => setError("")} /> : null}

      <div className="alp-hero__cta">
        {user ? (
          <button type="button" className="alp-btn alp-btn--primary" onClick={goHome}>
            Continuar como {user.name}
          </button>
        ) : null}

        <Link href="/auth/producer" className="alp-btn alp-btn--primary">
          Soy productor — crear cuenta
        </Link>

        <p className="alp-muted" style={{ marginTop: "0.5rem" }}>
          Acceso demo por rol (seed local):
        </p>
        <div className="alp-hero__roles">
          {DEMO_ROLES.map(r => (
            <button
              key={r.email}
              type="button"
              className="alp-btn alp-btn--ghost"
              disabled={busy !== null}
              onClick={() => void onDemo(r.email)}
            >
              {busy === r.email ? "…" : r.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
