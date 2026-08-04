"use client";

import { useSendOTP, useVerifyOTP } from "@zerodev/wallet-react";
import { useConfig } from "wagmi";
import { useState } from "react";
import { useAuth } from "~~/components/alpacto/AuthProvider";
import { demoSmartAccountAddress } from "~~/lib/demo-account";
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
    <form className="alp-form" onSubmit={e => void onSubmit(e)}>
      <p className="alp-note">
        Demo OTP: tras enviar, usa el código <strong>{DEMO_OTP}</strong>. Configura{" "}
        <code>NEXT_PUBLIC_ZERODEV_PROJECT_ID</code> para correo real.
      </p>
      <div className="alp-field">
        <label htmlFor="o-email">Correo</label>
        <input
          id="o-email"
          type="email"
          autoComplete="email"
          value={otpEmail}
          onChange={e => setOtpEmail(e.target.value)}
          required
          disabled={otpSent}
        />
      </div>
      <div className="alp-field">
        <label htmlFor="o-name">Nombre</label>
        <input id="o-name" value={otpName} onChange={e => setOtpName(e.target.value)} disabled={otpSent} />
      </div>
      {otpSent ? (
        <div className="alp-field">
          <label htmlFor="o-code">Código</label>
          <input
            id="o-code"
            inputMode="numeric"
            value={otpCode}
            onChange={e => setOtpCode(e.target.value)}
            placeholder={DEMO_OTP}
            required
          />
        </div>
      ) : null}
      <button type="submit" className="alp-btn alp-btn--primary" disabled={busy}>
        {busy ? "…" : otpSent ? "Verificar y entrar" : "Enviar código"}
      </button>
      {otpSent ? (
        <button
          type="button"
          className="alp-link-btn"
          onClick={() => {
            setOtpSent(false);
            setOtpCode("");
          }}
        >
          Cambiar correo
        </button>
      ) : null}
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
    <form className="alp-form" onSubmit={e => void onSubmit(e)}>
      <p className="alp-note">
        Te enviaremos un código a tu correo (ZeroDev). Revisa bandeja y spam. Luego vinculamos tu sesión en Alpacto.
      </p>
      <div className="alp-field">
        <label htmlFor="o-email">Correo</label>
        <input
          id="o-email"
          type="email"
          autoComplete="email"
          value={otpEmail}
          onChange={e => setOtpEmail(e.target.value)}
          required
          disabled={otpSent}
        />
      </div>
      <div className="alp-field">
        <label htmlFor="o-name">Nombre</label>
        <input id="o-name" value={otpName} onChange={e => setOtpName(e.target.value)} disabled={otpSent} />
      </div>
      {otpSent ? (
        <div className="alp-field">
          <label htmlFor="o-code">Código</label>
          <input
            id="o-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={otpCode}
            onChange={e => setOtpCode(e.target.value)}
            placeholder="Código del correo"
            required
          />
        </div>
      ) : null}
      <button type="submit" className="alp-btn alp-btn--primary" disabled={disabled}>
        {sending
          ? "Enviando…"
          : verifying
            ? "Verificando…"
            : busy
              ? "…"
              : otpSent
                ? "Verificar y entrar"
                : "Enviar código"}
      </button>
      {otpSent ? (
        <button
          type="button"
          className="alp-link-btn"
          onClick={() => {
            setOtpSent(false);
            setOtpCode("");
            setPending(null);
          }}
        >
          Cambiar correo
        </button>
      ) : null}
      {sendOTP.isError ? <p className="alp-muted">{sendOTP.error.message}</p> : null}
      {verifyOTP.isError ? <p className="alp-muted">{verifyOTP.error.message}</p> : null}
    </form>
  );
}
