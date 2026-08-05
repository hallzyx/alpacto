"use client";

import { useCallback, useEffect, useState } from "react";
import { ErrorBanner, RequireAuth, Skeleton } from "~~/components/alpacto";
import { apiFetch, API_URL } from "~~/lib/api";
import { formatEscrowUsd, ONCHAIN_ACTIVITY_LABELS, shortTxHash } from "~~/lib/format";
import deployedContracts from "~~/contracts/deployedContracts";

type OnchainActivity = {
  id: string;
  type: string;
  txHash: string;
  at: string;
  orderRef: string | null;
  orderId: string | null;
  lotId: string | null;
  detail: string | null;
  amountUsdcUnits: string | null;
  explorerUrl: string;
};

type OnchainActivityResponse = {
  chainId: number;
  explorerName: string;
  activities: OnchainActivity[];
};

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("es-PE", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function AdminInner() {
  const [health, setHealth] = useState<string>("…");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revokeResult, setRevokeResult] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [onchain, setOnchain] = useState<OnchainActivityResponse | null>(null);
  const [onchainLoading, setOnchainLoading] = useState(true);

  const loadOnchain = useCallback(async () => {
    setOnchainLoading(true);
    try {
      const data = await apiFetch<OnchainActivityResponse>("/admin/onchain-activity");
      setOnchain(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar actividad on-chain");
    } finally {
      setOnchainLoading(false);
    }
  }, []);

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
    void loadOnchain();
    return () => {
      cancelled = true;
    };
  }, [loadOnchain]);

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
        <p className="alp-subtitle">Tesorería, contratos, txs on-chain y control de Ayni.</p>
      </div>

      {error ? <ErrorBanner message={error} onDismiss={() => setError("")} /> : null}

      <div className="alp-panel">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}>
          <h2 className="alp-title" style={{ fontSize: "1.25rem", margin: 0 }}>
            Actividad on-chain
          </h2>
          <button type="button" className="alp-link-btn" onClick={() => void loadOnchain()}>
            Actualizar
          </button>
        </div>
        <p className="alp-muted" style={{ marginTop: "0.35rem" }}>
          Transacciones del flujo en {onchain?.explorerName ?? "Arbiscan"}. Solo visible para admin.
        </p>

        {onchainLoading ? (
          <p className="alp-muted">Cargando transacciones…</p>
        ) : !onchain?.activities.length ? (
          <p className="alp-note" style={{ marginTop: "0.75rem" }}>
            Sin transacciones registradas aún. Aparecerán al fondear una orden o al ejecutar pasos on-chain del demo.
          </p>
        ) : (
          <div className="alp-list" style={{ marginTop: "0.75rem" }}>
            {onchain.activities.map(item => (
              <div key={item.id} className="alp-panel" style={{ padding: "0.75rem 1rem" }}>
                <div className="alp-lot-row__meta" style={{ marginBottom: "0.35rem" }}>
                  <span className="alp-lot-row__id">{ONCHAIN_ACTIVITY_LABELS[item.type] ?? item.type}</span>
                  <span className="alp-muted">{formatWhen(item.at)}</span>
                </div>
                <dl className="alp-kv" style={{ fontSize: "0.9rem" }}>
                  <dt>Orden</dt>
                  <dd>{item.orderRef ?? item.orderId?.slice(0, 8) ?? "—"}</dd>
                  {item.lotId ? (
                    <>
                      <dt>Lote</dt>
                      <dd style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{item.lotId.slice(0, 8)}</dd>
                    </>
                  ) : null}
                  {item.amountUsdcUnits ? (
                    <>
                      <dt>Monto escrow</dt>
                      <dd>{formatEscrowUsd(item.amountUsdcUnits)} USDC</dd>
                    </>
                  ) : null}
                  <dt>Detalle</dt>
                  <dd>{item.detail ?? "—"}</dd>
                  <dt>Tx</dt>
                  <dd style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
                    <a href={item.explorerUrl} target="_blank" rel="noopener noreferrer" className="alp-link-btn">
                      {shortTxHash(item.txHash)} → Arbiscan
                    </a>
                  </dd>
                </dl>
              </div>
            ))}
          </div>
        )}
      </div>

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
        <p className="alp-note">Las direcciones y montos en stablecoin se muestran solo en admin.</p>
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
