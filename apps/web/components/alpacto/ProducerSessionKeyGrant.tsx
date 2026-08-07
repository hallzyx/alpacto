"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "~~/components/ui/button";
import {
  fetchProducerSessionKeyStatus,
  grantProducerSessionKey,
  type ProducerSessionKeyStatus,
} from "~~/lib/producer-session-grant";
import { isZeroDevConfigured } from "~~/lib/zerodev-wagmi";

type Props = {
  /** When true, always render the grant CTA (e.g. after PRODUCER_SESSION_REQUIRED). */
  force?: boolean;
  className?: string;
  onGranted?: () => void;
};

/**
 * One-time authorization so Alpacto can settle / reweigh on behalf of a Google/OTP Kernel.
 * Seed demo producers never see this (API reports needsGrant: false).
 */
export function ProducerSessionKeyGrant({ force = false, className, onGranted }: Props) {
  const [status, setStatus] = useState<ProducerSessionKeyStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const s = await fetchProducerSessionKeyStatus();
      setStatus(s);
      return s;
    } catch {
      setStatus(null);
      return null;
    }
  }, []);

  useEffect(() => {
    if (!isZeroDevConfigured()) return;
    void refresh();
  }, [refresh]);

  const needsGrant = force || (status?.needsGrant === true && status.signerKind !== "seed");

  if (!isZeroDevConfigured()) return null;
  if (done) return null;
  if (!force && !needsGrant) return null;
  if (!force && status?.status === "active") return null;

  const authorize = async () => {
    setBusy(true);
    setError("");
    try {
      await grantProducerSessionKey();
      setDone(true);
      await refresh();
      onGranted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo configurar la firma");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={
        className ??
        "flex flex-col gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      }
    >
      <div className="flex gap-3">
        <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-ring" aria-hidden />
        <div>
          <p className="text-sm font-medium text-foreground">Tu firma, solo cuando tú lo decidas</p>
          <p className="text-sm text-muted-foreground">
            Alpacto no liquida ni pide re-pesajes por su cuenta. Solo cuando aceptes una liquidación o solicites un
            re-pesaje usamos tu autorización para confirmar la operación. Configúralo una vez si entras con Google.
          </p>
          {error ? <p className="mt-1 text-sm text-destructive">{error}</p> : null}
        </div>
      </div>
      <Button type="button" size="sm" disabled={busy} onClick={() => void authorize()} className="shrink-0">
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Firmando…
          </>
        ) : (
          "Configurar firma"
        )}
      </Button>
    </div>
  );
}
