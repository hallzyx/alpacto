"use client";

import { OAUTH_PROVIDERS, useAuthenticateOAuth } from "@zerodev/wallet-react";
import { useState } from "react";
import { useConfig } from "wagmi";
import { useAuth } from "~~/components/alpacto/AuthProvider";
import { Button } from "~~/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "~~/components/ui/field";
import { Input } from "~~/components/ui/input";
import { demoSmartAccountAddress } from "~~/lib/demo-account";
import { fetchZeroDevEmailContact, isZeroDevConfigured, resolveZeroDevSmartAccountAddress } from "~~/lib/zerodev-wagmi";

type Props = {
  busy: boolean;
  setBusy: (v: boolean) => void;
  setError: (msg: string) => void;
};

function FormNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border-l-2 border-ring/60 bg-muted px-3 py-2 text-sm text-muted-foreground">{children}</p>
  );
}

function GoogleIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"
      />
    </svg>
  );
}

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
    <form onSubmit={e => void onSubmit(e)}>
      <FieldGroup className="gap-4">
        <FormNote>
          Configura <code>NEXT_PUBLIC_ZERODEV_PROJECT_ID</code> para Google real. Mientras, sesión demo local.
        </FormNote>
        <Field>
          <FieldLabel htmlFor="g-email">Correo</FieldLabel>
          <Input
            id="g-email"
            type="email"
            autoComplete="email"
            placeholder="martina@ejemplo.pe"
            value={googleEmail}
            onChange={e => setGoogleEmail(e.target.value)}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="g-name">Nombre</FieldLabel>
          <Input
            id="g-name"
            value={googleName}
            onChange={e => setGoogleName(e.target.value)}
            placeholder="Martina Quispe"
          />
        </Field>
        <Field>
          <Button type="submit" variant="outline" className="w-full" disabled={busy}>
            <GoogleIcon />
            {busy ? "Entrando…" : "Continuar con Google (demo)"}
          </Button>
        </Field>
      </FieldGroup>
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
      <form onSubmit={e => void completeProfile(e)}>
        <FieldGroup className="gap-4">
          <FormNote>Google conectado. Confirma el correo para crear tu sesión en Alpacto.</FormNote>
          <Field>
            <FieldLabel htmlFor="g-email-live">Correo</FieldLabel>
            <Input
              id="g-email-live"
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="g-name-live">Nombre</FieldLabel>
            <Input id="g-name-live" value={name} onChange={e => setName(e.target.value)} placeholder="Tu nombre" />
          </Field>
          <Field>
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Entrando…" : "Completar y entrar"}
            </Button>
          </Field>
        </FieldGroup>
      </form>
    );
  }

  return (
    <Field>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={pending}
        onClick={() => void connectGoogle()}
      >
        <GoogleIcon />
        {authenticateOAuth.isPending ? "Esperando Google…" : pending ? "Entrando…" : "Continuar con Google"}
      </Button>
      {authenticateOAuth.isError ? <p className="text-sm text-destructive">{authenticateOAuth.error.message}</p> : null}
    </Field>
  );
}
