"use client";

import { OAUTH_PROVIDERS, useAuthenticateOAuth } from "@zerodev/wallet-react";
import { useState } from "react";
import { useConfig } from "wagmi";
import { useAuth } from "~~/components/alpacto/AuthProvider";
import { demoSmartAccountAddress } from "~~/lib/demo-account";
import { fetchZeroDevEmailContact, isZeroDevConfigured, resolveZeroDevSmartAccountAddress } from "~~/lib/zerodev-wagmi";

type Props = {
  busy: boolean;
  setBusy: (v: boolean) => void;
  setError: (msg: string) => void;
};

export function ProducerGoogleAuthForm(props: Props) {
  if (isZeroDevConfigured()) {
    return <ProducerGoogleLiveForm {...props} />;
  }
  return <ProducerGoogleDemoForm {...props} />;
}

function ProducerGoogleDemoForm({ busy, setBusy, setError }: Props) {
  const { producerSession } = useAuth();
  const [googleEmail, setGoogleEmail] = useState("");
  const [googleName, setGoogleName] = useState("");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const email = googleEmail.trim().toLowerCase();
      const name = googleName.trim() || email.split("@")[0] || "Productor";
      if (!email) throw new Error("Ingresa tu correo");
      await producerSession({
        email,
        name,
        smartAccountAddress: demoSmartAccountAddress(email),
        authMethod: "google",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de autenticación");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="alp-form" onSubmit={e => void onSubmit(e)}>
      <p className="alp-note">
        Configura <code>NEXT_PUBLIC_ZERODEV_PROJECT_ID</code> para Google real. Mientras, sesión demo local.
      </p>
      <div className="alp-field">
        <label htmlFor="g-email">Correo</label>
        <input
          id="g-email"
          type="email"
          autoComplete="email"
          value={googleEmail}
          onChange={e => setGoogleEmail(e.target.value)}
          required
        />
      </div>
      <div className="alp-field">
        <label htmlFor="g-name">Nombre</label>
        <input
          id="g-name"
          value={googleName}
          onChange={e => setGoogleName(e.target.value)}
          placeholder="Martina Quispe"
        />
      </div>
      <button type="submit" className="alp-btn alp-btn--primary" disabled={busy}>
        {busy ? "Entrando…" : "Continuar con Google (demo)"}
      </button>
    </form>
  );
}

function ProducerGoogleLiveForm({ busy, setBusy, setError }: Props) {
  const { producerSession } = useAuth();
  const wagmiConfig = useConfig();
  const authenticateOAuth = useAuthenticateOAuth();

  const [needsProfile, setNeedsProfile] = useState(false);
  const [smartAccountAddress, setSmartAccountAddress] = useState<`0x${string}` | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  const finishSession = async (sessionEmail: string, sessionName: string, address: `0x${string}`) => {
    await producerSession({
      email: sessionEmail,
      name: sessionName,
      smartAccountAddress: address,
      authMethod: "google",
    });
  };

  const connectGoogle = async () => {
    setError("");
    setBusy(true);
    try {
      await authenticateOAuth.mutateAsync({ provider: OAUTH_PROVIDERS.GOOGLE });
      const address = await resolveZeroDevSmartAccountAddress(wagmiConfig);
      setSmartAccountAddress(address);

      let resolvedEmail: string | null = null;
      try {
        resolvedEmail = await fetchZeroDevEmailContact(wagmiConfig);
      } catch {
        resolvedEmail = null;
      }

      if (resolvedEmail) {
        const display = resolvedEmail.split("@")[0] || "Productor";
        setEmail(resolvedEmail);
        setName(display);
        await finishSession(resolvedEmail, display, address);
        return;
      }

      setNeedsProfile(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de autenticación con Google");
    } finally {
      setBusy(false);
    }
  };

  const completeProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (!smartAccountAddress) throw new Error("Vuelve a conectar con Google");
      const sessionEmail = email.trim().toLowerCase();
      if (!sessionEmail) throw new Error("Ingresa el correo de tu cuenta Google");
      const sessionName = name.trim() || sessionEmail.split("@")[0] || "Productor";
      await finishSession(sessionEmail, sessionName, smartAccountAddress);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al vincular sesión");
    } finally {
      setBusy(false);
    }
  };

  const pending = busy || authenticateOAuth.isPending;

  if (needsProfile) {
    return (
      <form className="alp-form" onSubmit={e => void completeProfile(e)}>
        <p className="alp-note">Google conectado. Confirma el correo para crear tu sesión en Alpacto.</p>
        <div className="alp-field">
          <label htmlFor="g-email-live">Correo</label>
          <input
            id="g-email-live"
            type="email"
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="alp-field">
          <label htmlFor="g-name-live">Nombre</label>
          <input id="g-name-live" value={name} onChange={e => setName(e.target.value)} placeholder="Tu nombre" />
        </div>
        <button type="submit" className="alp-btn alp-btn--primary" disabled={pending}>
          {pending ? "Entrando…" : "Completar y entrar"}
        </button>
      </form>
    );
  }

  return (
    <div className="alp-form">
      <p className="alp-note">
        Abre el popup de Google (ZeroDev). En el dashboard, añade el origin <code>http://localhost:3000</code> a OAuth
        Redirect URLs / ACL si aún no está.
      </p>
      <button
        type="button"
        className="alp-btn alp-btn--primary"
        disabled={pending}
        onClick={() => void connectGoogle()}
      >
        {authenticateOAuth.isPending ? "Esperando Google…" : pending ? "Entrando…" : "Continuar con Google"}
      </button>
      {authenticateOAuth.isError ? <p className="alp-muted">{authenticateOAuth.error.message}</p> : null}
    </div>
  );
}
