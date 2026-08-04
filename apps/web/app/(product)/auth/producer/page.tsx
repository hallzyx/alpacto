"use client";

import { useState } from "react";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { ErrorBanner, useAuth } from "~~/components/alpacto";
import { ProducerEmailOtpForm } from "~~/components/alpacto/ProducerEmailOtpForm";
import { ProducerGoogleAuthForm } from "~~/components/alpacto/ProducerGoogleAuthForm";
import { apiFetch } from "~~/lib/api";
import { demoSmartAccountAddress } from "~~/lib/demo-account";

type AuthTab = "google" | "email" | "passkey";

export default function ProducerAuthPage() {
  const { producerSession, demoLogin } = useAuth();
  const [tab, setTab] = useState<AuthTab>("google");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Passkey path
  const [passkeyEmail, setPasskeyEmail] = useState("");
  const [passkeyName, setPasskeyName] = useState("");
  const [passkeyMode, setPasskeyMode] = useState<"register" | "login">("register");

  const run = async (fn: () => Promise<void>) => {
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de autenticación");
    } finally {
      setBusy(false);
    }
  };

  const registerPasskey = async () => {
    const email = passkeyEmail.trim().toLowerCase();
    const name = passkeyName.trim() || email.split("@")[0] || "Productor";
    if (!email) throw new Error("Ingresa tu correo");

    const { options, userId } = await apiFetch<{
      options: Parameters<typeof startRegistration>[0]["optionsJSON"];
      userId: string;
    }>("/auth/passkey/register/options", {
      method: "POST",
      body: { email, name, role: "producer" },
      auth: false,
    });

    const attestation = await startRegistration({ optionsJSON: options });
    const result = await apiFetch<{
      verified: boolean;
      token: string;
      user: { id: string; email: string; role: string; name: string; smartAccountAddress?: string | null };
    }>("/auth/passkey/register/verify", {
      method: "POST",
      body: { userId, response: attestation },
      auth: false,
    });

    if (!result.verified) throw new Error("Registro passkey falló");

    // Prefer API-linked Kernel address; fall back to local demo address.
    const smart =
      result.user.smartAccountAddress && /^0x[a-fA-F0-9]{40}$/.test(result.user.smartAccountAddress)
        ? result.user.smartAccountAddress
        : demoSmartAccountAddress(email);

    await producerSession({
      email,
      name: result.user.name || name,
      smartAccountAddress: smart,
      authMethod: "passkey",
    });
  };

  const loginPasskey = async () => {
    const email = passkeyEmail.trim().toLowerCase();
    if (!email) throw new Error("Ingresa tu correo");

    const { options, userId } = await apiFetch<{
      options: Parameters<typeof startAuthentication>[0]["optionsJSON"];
      userId: string;
    }>("/auth/passkey/login/options", {
      method: "POST",
      body: { email },
      auth: false,
    });

    const assertion = await startAuthentication({ optionsJSON: options });
    const result = await apiFetch<{
      verified: boolean;
      token: string;
      user: { id: string; email: string; role: string; name: string; smartAccountAddress?: string | null };
    }>("/auth/passkey/login/verify", {
      method: "POST",
      body: { userId, response: assertion },
      auth: false,
    });

    if (!result.verified) throw new Error("Login passkey falló");

    const smart =
      result.user.smartAccountAddress && /^0x[a-fA-F0-9]{40}$/.test(result.user.smartAccountAddress)
        ? result.user.smartAccountAddress
        : demoSmartAccountAddress(email);

    await producerSession({
      email,
      name: result.user.name,
      smartAccountAddress: smart,
      authMethod: "passkey",
    });
  };

  return (
    <div className="alp-page" style={{ maxWidth: "32rem" }}>
      <div>
        <h1 className="alp-title">Cuenta de productor</h1>
        <p className="alp-subtitle">Elige cómo entrar. Sin MetaMask ni gas en el flujo principal.</p>
      </div>

      {error ? <ErrorBanner message={error} onDismiss={() => setError("")} /> : null}

      <div className="alp-tabs" role="tablist">
        {(
          [
            ["google", "Google"],
            ["email", "Email OTP"],
            ["passkey", "Passkey"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            className={`alp-tab${tab === id ? " alp-tab--active" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="alp-panel alp-auth-paths">
        {tab === "google" ? <ProducerGoogleAuthForm busy={busy} setBusy={setBusy} setError={setError} /> : null}

        {tab === "email" ? <ProducerEmailOtpForm busy={busy} setBusy={setBusy} setError={setError} /> : null}

        {tab === "passkey" ? (
          <form
            className="alp-form"
            onSubmit={e => {
              e.preventDefault();
              void run(passkeyMode === "register" ? registerPasskey : loginPasskey);
            }}
          >
            <div className="alp-tabs">
              <button
                type="button"
                className={`alp-tab${passkeyMode === "register" ? " alp-tab--active" : ""}`}
                onClick={() => setPasskeyMode("register")}
              >
                Registrar
              </button>
              <button
                type="button"
                className={`alp-tab${passkeyMode === "login" ? " alp-tab--active" : ""}`}
                onClick={() => setPasskeyMode("login")}
              >
                Entrar
              </button>
            </div>
            <div className="alp-field">
              <label htmlFor="p-email">Correo</label>
              <input
                id="p-email"
                type="email"
                value={passkeyEmail}
                onChange={e => setPasskeyEmail(e.target.value)}
                required
              />
            </div>
            {passkeyMode === "register" ? (
              <div className="alp-field">
                <label htmlFor="p-name">Nombre</label>
                <input id="p-name" value={passkeyName} onChange={e => setPasskeyName(e.target.value)} />
              </div>
            ) : null}
            <button type="submit" className="alp-btn alp-btn--primary" disabled={busy}>
              {busy ? "Esperando passkey…" : passkeyMode === "register" ? "Crear passkey" : "Usar passkey"}
            </button>
          </form>
        ) : null}
      </div>

      <div className="alp-panel">
        <p className="alp-muted" style={{ marginTop: 0 }}>
          ¿Ya tienes la cuenta seed de Martina?
        </p>
        <button
          type="button"
          className="alp-btn alp-btn--ghost"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await demoLogin("martina@demo.alpacto");
            })
          }
        >
          Continuar demo como Martina
        </button>
      </div>
    </div>
  );
}
