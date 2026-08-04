"use client";

import { useEffect, useState } from "react";
import { ErrorBanner, RequireAuth, Skeleton } from "~~/components/alpacto";
import { apiFetch, API_URL } from "~~/lib/api";
import deployedContracts from "~~/contracts/deployedContracts";

function AdminInner() {
  const [health, setHealth] = useState<string>("…");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revokeResult, setRevokeResult] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const h = await apiFetch<{ status: string; service: string }>("/health", { auth: false });
        if (!cancelled) setHealth(`${h.service}: ${h.status}`);
      } catch {
        if (!cancelled) setHealth("API no disponible");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const revoke = async () => {
    setBusy(true);
    setError("");
    setRevokeResult("");
    try {
      const res = await apiFetch<{ revoked: number }>("/admin/ayni/session-key/revoke", {
        method: "POST",
        body: {},
      });
      setRevokeResult(`Claves revocadas: ${res.revoked}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo revocar");
    } finally {
      setBusy(false);
    }
  };

  const sepolia = (deployedContracts as Record<string, Record<string, { address: string }>>)["421614"];
  const core = sepolia?.["alpacto-core"]?.address;
  const yourContract = (deployedContracts as Record<string, Record<string, { address: string }>>)["412346"]?.[
    "your-contract"
  ]?.address;

  if (loading) return <Skeleton rows={4} />;

  return (
    <div className="alp-page">
      <div>
        <h1 className="alp-title">Admin</h1>
        <p className="alp-subtitle">Tesorería, contratos y control de Ayni.</p>
      </div>

      {error ? <ErrorBanner message={error} onDismiss={() => setError("")} /> : null}

      <div className="alp-panel">
        <h2 className="alp-title" style={{ fontSize: "1.25rem" }}>
          API
        </h2>
        <dl className="alp-kv">
          <dt>Base URL</dt>
          <dd style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{API_URL}</dd>
          <dt>Health</dt>
          <dd>{health}</dd>
        </dl>
      </div>

      <div className="alp-panel">
        <h2 className="alp-title" style={{ fontSize: "1.25rem" }}>
          Contratos
        </h2>
        <p className="alp-note">Las direcciones se muestran solo en admin. El flujo productor no expone 0x.</p>
        <dl className="alp-kv">
          <dt>AlpactoCore (Sepolia)</dt>
          <dd style={{ fontFamily: "monospace", fontSize: "0.75rem", wordBreak: "break-all" }}>
            {core ?? "— (despliega en sepolia)"}
          </dd>
          <dt>your-contract (local)</dt>
          <dd style={{ fontFamily: "monospace", fontSize: "0.75rem", wordBreak: "break-all" }}>
            {yourContract ?? "—"}
          </dd>
          <dt>USDC test</dt>
          <dd style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d</dd>
        </dl>
      </div>

      <div className="alp-panel">
        <h2 className="alp-title" style={{ fontSize: "1.25rem" }}>
          Session key Ayni
        </h2>
        <p className="alp-muted">Revoca claves de sesión activas del auditor.</p>
        <div className="alp-actions">
          <button type="button" className="alp-btn alp-btn--danger" disabled={busy} onClick={() => void revoke()}>
            {busy ? "Revocando…" : "Revocar Ayni"}
          </button>
        </div>
        {revokeResult ? <p className="alp-note">{revokeResult}</p> : null}
      </div>
    </div>
  );
}

export default function AdminPage() {
  return (
    <RequireAuth roles="admin">
      <AdminInner />
    </RequireAuth>
  );
}
