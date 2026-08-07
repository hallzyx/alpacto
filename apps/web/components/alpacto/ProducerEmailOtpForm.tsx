"use client";

import { useSendOTP, useVerifyOTP } from "@zerodev/wallet-react";
import { useConfig } from "wagmi";
import { useState } from "react";
import { useAuth } from "~~/components/alpacto/AuthProvider";
import { Button } from "~~/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "~~/components/ui/field";
import { Input } from "~~/components/ui/input";
import { demoSmartAccountAddress } from "~~/lib/demo-account";
import { maybeGrantProducerSessionKey } from "~~/lib/producer-session-grant";
import { isZeroDevConfigured, resolveZeroDevSmartAccountAddress } from "~~/lib/zerodev-wagmi";

const DEMO_OTP = "123456";

type PendingOtp = {
  otpId: string;
  otpEncryptionTargetBundle: string;
};

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

export function ProducerEmailOtpForm(props: Props) {
  if (isZeroDevConfigured()) {
    return <ProducerEmailOtpLiveForm {...props} />;
  }
  return <ProducerEmailOtpDemoForm {...props} />;
}

function ProducerEmailOtpDemoForm({ busy, setBusy, setError }: Props) {
  const { producerSession } = useAuth();
  const [otpEmail, setOtpEmail] = useState("");
  const [otpName, setOtpName] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const email = otpEmail.trim().toLowerCase();
      if (!email) throw new Error("Ingresa tu correo");

      if (!otpSent) {
        setOtpSent(true);
        return;
      }

      const name = otpName.trim() || email.split("@")[0] || "Productor";
      if (otpCode.trim() !== DEMO_OTP) {
        throw new Error(`Código incorrecto. En demo usa ${DEMO_OTP}`);
      }
      await producerSession({
        email,
        name,
        smartAccountAddress: demoSmartAccountAddress(email),
        authMethod: "email_otp",
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
          Demo OTP: tras enviar, usa el código <strong>{DEMO_OTP}</strong>. Configura{" "}
          <code>NEXT_PUBLIC_ZERODEV_PROJECT_ID</code> para correo real.
        </FormNote>
        <Field>
          <FieldLabel htmlFor="o-email">Correo</FieldLabel>
          <Input
            id="o-email"
            type="email"
            autoComplete="email"
            placeholder="martina@ejemplo.pe"
            value={otpEmail}
            onChange={e => setOtpEmail(e.target.value)}
            required
            disabled={otpSent}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="o-name">Nombre</FieldLabel>
          <Input id="o-name" value={otpName} onChange={e => setOtpName(e.target.value)} disabled={otpSent} />
        </Field>
        {otpSent ? (
          <Field>
            <FieldLabel htmlFor="o-code">Código</FieldLabel>
            <Input
              id="o-code"
              inputMode="numeric"
              value={otpCode}
              onChange={e => setOtpCode(e.target.value)}
              placeholder={DEMO_OTP}
              required
            />
          </Field>
        ) : null}
        <Field>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "…" : otpSent ? "Verificar y entrar" : "Enviar código"}
          </Button>
        </Field>
        {otpSent ? (
          <Button
            type="button"
            variant="link"
            className="self-start"
            onClick={() => {
              setOtpSent(false);
              setOtpCode("");
            }}
          >
            Cambiar correo
          </Button>
        ) : null}
      </FieldGroup>
    </form>
  );
}

function ProducerEmailOtpLiveForm({ busy, setBusy, setError }: Props) {
  const { producerSession } = useAuth();
  const wagmiConfig = useConfig();
  const sendOTP = useSendOTP();
  const verifyOTP = useVerifyOTP();

  const [otpEmail, setOtpEmail] = useState("");
  const [otpName, setOtpName] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [pending, setPending] = useState<PendingOtp | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const email = otpEmail.trim().toLowerCase();
      if (!email) throw new Error("Ingresa tu correo");

      if (!otpSent) {
        const result = await sendOTP.mutateAsync({ email });
        setPending({
          otpId: result.otpId,
          otpEncryptionTargetBundle: result.otpEncryptionTargetBundle,
        });
        setOtpSent(true);
        return;
      }

      const name = otpName.trim() || email.split("@")[0] || "Productor";
      const code = otpCode.trim();
      if (!code) throw new Error("Ingresa el código");
      if (!pending) throw new Error("Vuelve a enviar el código");

      await verifyOTP.mutateAsync({
        code,
        otpId: pending.otpId,
        otpEncryptionTargetBundle: pending.otpEncryptionTargetBundle,
      });

      const smartAccountAddress = await resolveZeroDevSmartAccountAddress(wagmiConfig);
      await producerSession({
        email,
        name,
        smartAccountAddress,
        authMethod: "email_otp",
      });
      await maybeGrantProducerSessionKey(wagmiConfig);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de autenticación");
    } finally {
      setBusy(false);
    }
  };

  const sending = sendOTP.isPending;
  const verifying = verifyOTP.isPending;
  const disabled = busy || sending || verifying;

  return (
    <form onSubmit={e => void onSubmit(e)}>
      <FieldGroup className="gap-4">
        <FormNote>
          Te enviaremos un código a tu correo. Revisa bandeja y spam. Luego vinculamos tu sesión en Alpacto.
        </FormNote>
        <Field>
          <FieldLabel htmlFor="o-email">Correo</FieldLabel>
          <Input
            id="o-email"
            type="email"
            autoComplete="email"
            value={otpEmail}
            onChange={e => setOtpEmail(e.target.value)}
            required
            disabled={otpSent}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="o-name">Nombre</FieldLabel>
          <Input id="o-name" value={otpName} onChange={e => setOtpName(e.target.value)} disabled={otpSent} />
        </Field>
        {otpSent ? (
          <Field>
            <FieldLabel htmlFor="o-code">Código</FieldLabel>
            <Input
              id="o-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={otpCode}
              onChange={e => setOtpCode(e.target.value)}
              placeholder="Código del correo"
              required
            />
          </Field>
        ) : null}
        <Field>
          <Button type="submit" className="w-full" disabled={disabled}>
            {sending
              ? "Enviando…"
              : verifying
                ? "Verificando…"
                : busy
                  ? "…"
                  : otpSent
                    ? "Verificar y entrar"
                    : "Enviar código"}
          </Button>
        </Field>
        {otpSent ? (
          <Button
            type="button"
            variant="link"
            className="self-start"
            onClick={() => {
              setOtpSent(false);
              setOtpCode("");
              setPending(null);
            }}
          >
            Cambiar correo
          </Button>
        ) : null}
        {sendOTP.isError ? <p className="text-sm text-destructive">{sendOTP.error.message}</p> : null}
        {verifyOTP.isError ? <p className="text-sm text-destructive">{verifyOTP.error.message}</p> : null}
      </FieldGroup>
    </form>
  );
}
