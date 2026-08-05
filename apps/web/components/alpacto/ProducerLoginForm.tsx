"use client";

import { useState } from "react";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { KeyRoundIcon } from "lucide-react";
import { useAuth } from "~~/components/alpacto";
import { ProducerEmailOtpForm } from "~~/components/alpacto/ProducerEmailOtpForm";
import { ProducerGoogleAuthForm } from "~~/components/alpacto/ProducerGoogleAuthForm";
import { Button } from "~~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~~/components/ui/card";
import { Field, FieldGroup, FieldLabel, FieldSeparator } from "~~/components/ui/field";
import { Input } from "~~/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~~/components/ui/tabs";
import { apiFetch } from "~~/lib/api";
import { demoSmartAccountAddress } from "~~/lib/demo-account";
import { cn } from "~~/lib/utils";

type PasskeyMode = "register" | "login";

export function ProducerLoginForm({ className }: { className?: string }) {
  const { producerSession, demoLogin } = useAuth();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [passkeyEmail, setPasskeyEmail] = useState("");
  const [passkeyName, setPasskeyName] = useState("");
  const [passkeyMode, setPasskeyMode] = useState<PasskeyMode>("register");

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
    <Card className={cn("w-full gap-6", className)}>
      <CardHeader className="gap-1">
        <CardTitle className="font-display text-2xl font-semibold tracking-tight">Cuenta de productor</CardTitle>
        <CardDescription className="text-balance">
          Elige cómo entrar. Sin MetaMask ni gas en el flujo principal.
        </CardDescription>
      </CardHeader>

      <CardContent className="grid gap-6">
        {error ? (
          <div
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </div>
        ) : null}

        <Tabs defaultValue="google" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="google">Google</TabsTrigger>
            <TabsTrigger value="email">Email OTP</TabsTrigger>
            <TabsTrigger value="passkey">Passkey</TabsTrigger>
          </TabsList>

          <TabsContent value="google" className="mt-6">
            <ProducerGoogleAuthForm busy={busy} setBusy={setBusy} setError={setError} />
          </TabsContent>

          <TabsContent value="email" className="mt-6">
            <ProducerEmailOtpForm busy={busy} setBusy={setBusy} setError={setError} />
          </TabsContent>

          <TabsContent value="passkey" className="mt-6">
            <form
              onSubmit={e => {
                e.preventDefault();
                void run(passkeyMode === "register" ? registerPasskey : loginPasskey);
              }}
            >
              <FieldGroup className="gap-4">
                <div className="flex gap-1 rounded-lg bg-muted p-1">
                  {(
                    [
                      ["register", "Registrar"],
                      ["login", "Entrar"],
                    ] as const
                  ).map(([mode, label]) => (
                    <Button
                      key={mode}
                      type="button"
                      size="sm"
                      variant="ghost"
                      className={cn("flex-1", passkeyMode === mode && "bg-background text-foreground shadow-sm")}
                      onClick={() => setPasskeyMode(mode)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                <Field>
                  <FieldLabel htmlFor="p-email">Correo</FieldLabel>
                  <Input
                    id="p-email"
                    type="email"
                    autoComplete="email"
                    placeholder="martina@ejemplo.pe"
                    value={passkeyEmail}
                    onChange={e => setPasskeyEmail(e.target.value)}
                    required
                  />
                </Field>
                {passkeyMode === "register" ? (
                  <Field>
                    <FieldLabel htmlFor="p-name">Nombre</FieldLabel>
                    <Input
                      id="p-name"
                      placeholder="Martina Quispe"
                      value={passkeyName}
                      onChange={e => setPasskeyName(e.target.value)}
                    />
                  </Field>
                ) : null}
                <Field>
                  <Button type="submit" className="w-full" disabled={busy}>
                    <KeyRoundIcon />
                    {busy ? "Esperando passkey…" : passkeyMode === "register" ? "Crear passkey" : "Usar passkey"}
                  </Button>
                </Field>
              </FieldGroup>
            </form>
          </TabsContent>
        </Tabs>

        <div className="grid gap-4">
          <FieldSeparator className="my-0">Demo</FieldSeparator>
          <p className="text-center text-sm text-muted-foreground">¿Ya tienes la cuenta seed de Martina?</p>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await demoLogin("martina@demo.alpacto");
              })
            }
          >
            Continuar demo como Martina
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
