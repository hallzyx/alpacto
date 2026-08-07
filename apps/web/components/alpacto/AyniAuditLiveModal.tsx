"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { CheckCircle2, Circle, Download, Loader2, Send, XCircle } from "lucide-react";
import ayniAudit from "~~/assets/ayni_audit.png";
import { AyniMarkdown } from "~~/components/alpacto/AyniMarkdown";
import { Button } from "~~/components/ui/button";
import { Input } from "~~/components/ui/input";
import { apiFetch } from "~~/lib/api";
import { formatKg, statusLabel } from "~~/lib/format";
import type { AuditFinding, AuditRunDetail } from "~~/lib/types";

const PHASES = [
  { id: "queued", label: "En cola" },
  { id: "context", label: "Contexto del lote" },
  { id: "scale", label: "Lectura de balanza" },
  { id: "classification", label: "Clasificación" },
  { id: "settlement", label: "Cálculo estimado" },
  { id: "compare", label: "Comparación" },
  { id: "report", label: "Informe" },
  { id: "attest", label: "Registro del veredicto" },
  { id: "done", label: "Listo" },
] as const;

type AuditLiveDetail = AuditRunDetail & {
  progressPhase?: string | null;
  progressLabel?: string | null;
  reportHash?: string | null;
  onchainTxHash?: string | null;
  explorerUrl?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
};

type ChatMsg = { role: "user" | "assistant"; content: string };

type AyniAuditLiveModalProps = {
  open: boolean;
  auditRunId: string;
  lotId: string;
  declaredWeightGrams: string;
  categoryCode: string;
  onClose: () => void;
};

function phaseIndex(phase: string | null | undefined): number {
  if (!phase || phase === "failed") return -1;
  const i = PHASES.findIndex(p => p.id === phase);
  return i >= 0 ? i : 0;
}

function isTerminal(detail: AuditLiveDetail | null): boolean {
  if (!detail) return false;
  if (detail.progressPhase === "done" || detail.progressPhase === "failed") return true;
  if (detail.status === "failed") return true;
  if (detail.status === "attested" && detail.resultCode) return true;
  return false;
}

function passedResult(code: string | null | undefined): boolean {
  return code === "pass" || code === "warning";
}

function downloadAuditPdf(opts: {
  lotId: string;
  detail: AuditLiveDetail;
  declaredWeightGrams: string;
  categoryCode: string;
}) {
  const { lotId, detail, declaredWeightGrams, categoryCode } = opts;
  const ok = passedResult(detail.resultCode);
  const resultText = statusLabel(detail.resultCode ?? detail.status);
  const generatedAt = new Date().toLocaleString("es-PE");
  const shortLot = lotId.slice(0, 8);

  const severityLabel = (s: string) => (s === "critical" ? "Crítico" : s === "warning" ? "Aviso" : "Info");

  const findingsHtml =
    detail.findings.length === 0
      ? `<p class="empty-findings">Sin hallazgos. El veredicto no reportó discrepancias.</p>`
      : `<div class="findings">${detail.findings
          .map(
            (f: AuditFinding) => `
        <article class="finding finding--${f.severity}">
          <header>
            <span class="finding-title">${statusLabel(f.code)}</span>
            <span class="finding-sev">${severityLabel(f.severity)}</span>
          </header>
          <dl>
            <div><dt>Declarado</dt><dd>${f.declaredValue ?? "—"}</dd></div>
            <div><dt>Observado</dt><dd>${f.observedValue ?? "—"}</dd></div>
          </dl>
          ${f.explanation ? `<p class="finding-note">${f.explanation}</p>` : ""}
        </article>`,
          )
          .join("")}</div>`;

  const explorer =
    detail.explorerUrl ||
    (detail.onchainTxHash && !detail.onchainTxHash.startsWith("local-")
      ? `https://sepolia.arbiscan.io/tx/${detail.onchainTxHash}`
      : null);

  const txBlock = detail.onchainTxHash
    ? explorer
      ? `<a href="${explorer}" target="_blank" rel="noreferrer">Ver comprobante del pago</a>`
      : `<code>${detail.onchainTxHash}</code>`
    : `<span class="muted">No registrado en esta revisión</span>`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <title>Constancia Ayni — Lote ${shortLot}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,650&family=Source+Sans+3:wght@400;500;600&display=swap" rel="stylesheet"/>
  <style>
    :root {
      --night: #0b1c2c;
      --indigo: #14374a;
      --teal: #1a6b6a;
      --accent: #2a9d8f;
      --mist: #e8eef2;
      --fiber: #c5d4d8;
      --ink: #0f2430;
      --muted: #4a6570;
      --ok: #1f7a5c;
      --ok-bg: #e6f4ee;
      --warn: #9a6b1f;
      --warn-bg: #f7f0e0;
      --err: #9b3a3a;
      --err-bg: #f7eaea;
      --line: rgba(20, 55, 74, 0.14);
      --paper: #f6f9fa;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--paper);
      color: var(--ink);
      font-family: "Source Sans 3", system-ui, sans-serif;
      line-height: 1.5;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .sheet {
      max-width: 760px;
      margin: 0 auto;
      min-height: 100vh;
      background:
        radial-gradient(90% 50% at 0% 0%, rgba(26, 107, 106, 0.14), transparent 55%),
        radial-gradient(70% 40% at 100% 0%, rgba(20, 55, 74, 0.12), transparent 50%),
        linear-gradient(180deg, #f8fbfb 0%, #eef4f5 100%);
    }
    .band {
      background: linear-gradient(135deg, var(--night) 0%, var(--indigo) 55%, var(--teal) 120%);
      color: #f3f8f8;
      padding: 2rem 2.25rem 1.75rem;
      position: relative;
      overflow: hidden;
    }
    .band::after {
      content: "";
      position: absolute;
      inset: auto -10% -40% 40%;
      height: 140%;
      background: radial-gradient(circle at center, rgba(42, 157, 143, 0.28), transparent 62%);
      pointer-events: none;
    }
    .brand-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 1rem;
      position: relative;
      z-index: 1;
    }
    .brand {
      font-family: Fraunces, Georgia, serif;
      font-weight: 650;
      font-size: 1.05rem;
      letter-spacing: 0.02em;
    }
    .brand span { color: var(--accent); font-weight: 500; }
    .doc-type {
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      color: rgba(243, 248, 248, 0.72);
    }
    h1 {
      position: relative;
      z-index: 1;
      font-family: Fraunces, Georgia, serif;
      font-weight: 650;
      font-size: 2rem;
      line-height: 1.15;
      margin: 1.1rem 0 0.45rem;
      letter-spacing: -0.02em;
    }
    .subtitle {
      position: relative;
      z-index: 1;
      margin: 0;
      color: rgba(243, 248, 248, 0.78);
      font-size: 0.95rem;
    }
    .body { padding: 1.75rem 2.25rem 2.5rem; }
    .verdict {
      display: grid;
      gap: 1rem;
      padding: 1.25rem 1.35rem;
      border-radius: 14px;
      border: 1px solid var(--line);
      background: #fff;
      box-shadow: 0 10px 30px rgba(11, 28, 44, 0.05);
    }
    .verdict--ok { border-color: rgba(31, 122, 92, 0.28); background: linear-gradient(180deg, #fff, var(--ok-bg)); }
    .verdict--bad { border-color: rgba(155, 58, 58, 0.28); background: linear-gradient(180deg, #fff, var(--err-bg)); }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      width: fit-content;
      padding: 0.28rem 0.7rem;
      border-radius: 999px;
      font-size: 0.78rem;
      font-weight: 600;
      letter-spacing: 0.02em;
    }
    .verdict--ok .pill { background: rgba(31, 122, 92, 0.12); color: var(--ok); }
    .verdict--bad .pill { background: rgba(155, 58, 58, 0.12); color: var(--err); }
    .pill-dot {
      width: 0.45rem;
      height: 0.45rem;
      border-radius: 50%;
      background: currentColor;
    }
    .verdict h2 {
      font-family: Fraunces, Georgia, serif;
      font-size: 1.45rem;
      font-weight: 650;
      margin: 0;
      color: var(--night);
      letter-spacing: -0.01em;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.75rem 1.25rem;
      margin: 0;
    }
    .meta-grid div { min-width: 0; }
    .meta-grid dt {
      margin: 0;
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
    }
    .meta-grid dd {
      margin: 0.15rem 0 0;
      font-weight: 600;
      color: var(--indigo);
      word-break: break-word;
    }
    .section {
      margin-top: 1.75rem;
    }
    .section h3 {
      font-family: Fraunces, Georgia, serif;
      font-size: 1.15rem;
      font-weight: 650;
      margin: 0 0 0.85rem;
      color: var(--night);
    }
    .chain {
      border: 1px solid var(--line);
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.86);
      padding: 1rem 1.15rem;
      display: grid;
      gap: 0.85rem;
    }
    .chain-row dt {
      margin: 0;
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
    }
    .chain-row dd {
      margin: 0.25rem 0 0;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 0.78rem;
      word-break: break-all;
      color: var(--indigo);
    }
    a { color: var(--accent); text-decoration: none; border-bottom: 1px solid rgba(42, 157, 143, 0.35); }
    a:hover { border-bottom-color: var(--accent); }
    .findings { display: grid; gap: 0.75rem; }
    .finding {
      border-radius: 12px;
      border: 1px solid var(--line);
      background: #fff;
      padding: 0.95rem 1.05rem;
    }
    .finding--critical { border-color: rgba(155, 58, 58, 0.25); background: linear-gradient(180deg, #fff, #fbf3f3); }
    .finding--warning { border-color: rgba(154, 107, 31, 0.25); background: linear-gradient(180deg, #fff, var(--warn-bg)); }
    .finding header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      margin-bottom: 0.65rem;
    }
    .finding-title { font-weight: 650; color: var(--night); }
    .finding-sev {
      font-size: 0.72rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
    }
    .finding--critical .finding-sev { color: var(--err); }
    .finding--warning .finding-sev { color: var(--warn); }
    .finding dl {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.55rem;
      margin: 0;
    }
    .finding dt {
      margin: 0;
      font-size: 0.68rem;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: var(--muted);
    }
    .finding dd {
      margin: 0.12rem 0 0;
      font-weight: 600;
      color: var(--indigo);
    }
    .finding-note {
      margin: 0.75rem 0 0;
      padding-top: 0.7rem;
      border-top: 1px solid var(--line);
      color: var(--ink);
      font-size: 0.92rem;
    }
    .empty-findings {
      margin: 0;
      padding: 1rem;
      border-radius: 12px;
      border: 1px dashed var(--fiber);
      color: var(--muted);
      background: rgba(255, 255, 255, 0.7);
    }
    .footer {
      margin-top: 2rem;
      padding-top: 1rem;
      border-top: 1px solid var(--line);
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      color: var(--muted);
      font-size: 0.82rem;
    }
    .footer strong { color: var(--teal); font-weight: 600; }
    .muted { color: var(--muted); }
    @media print {
      body { background: #fff; }
      .sheet { min-height: auto; background: #fff; }
      .body { padding-bottom: 1rem; }
    }
    @media (max-width: 640px) {
      .band, .body { padding-left: 1.25rem; padding-right: 1.25rem; }
      .meta-grid, .finding dl { grid-template-columns: 1fr; }
      h1 { font-size: 1.55rem; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <header class="band">
      <div class="brand-row">
        <div class="brand">Alpacto <span>· Fibra justa</span></div>
        <div class="doc-type">Constancia oficial</div>
      </div>
      <h1>Ayni Auditor</h1>
      <p class="subtitle">Veredicto de auditoría del lote ${shortLot} · Generado ${generatedAt}</p>
    </header>

    <main class="body">
      <section class="verdict ${ok ? "verdict--ok" : "verdict--bad"}">
        <div class="pill"><span class="pill-dot"></span>${resultText}</div>
        <h2>${ok ? "Ayni aprobó la revisión" : "Ayni no aprobó — se requiere revisión"}</h2>
        <dl class="meta-grid">
          <div>
            <dt>Lote</dt>
            <dd>${lotId}</dd>
          </div>
          <div>
            <dt>Inspección</dt>
            <dd>v${detail.inspectionVersion}</dd>
          </div>
          <div>
            <dt>Peso declarado</dt>
            <dd>${formatKg(declaredWeightGrams)}</dd>
          </div>
          <div>
            <dt>Categoría</dt>
            <dd>${categoryCode}</dd>
          </div>
        </dl>
      </section>

      <section class="section">
        <h3>Registro del veredicto</h3>
        <div class="chain">
          <div class="chain-row">
            <dt>Código del informe</dt>
            <dd><code>${detail.reportHash ?? "—"}</code></dd>
          </div>
          <div class="chain-row">
            <dt>Comprobante</dt>
            <dd>${txBlock}</dd>
          </div>
        </div>
      </section>

      <section class="section">
        <h3>Hallazgos</h3>
        ${findingsHtml}
      </section>

      <footer class="footer">
        <p>Documento de constancia del veredicto de <strong>Ayni</strong>. No sustituye la medición física del inspector.</p>
        <p>Lote ${shortLot}</p>
      </footer>
    </main>
  </div>
  <script>window.onload = () => { window.print(); }</script>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (!w) {
    const a = document.createElement("a");
    a.href = url;
    a.download = `ayni-audit-${shortLot}-v${detail.inspectionVersion}.html`;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function AyniAuditLiveModal({
  open,
  auditRunId,
  lotId,
  declaredWeightGrams,
  categoryCode,
  onClose,
}: AyniAuditLiveModalProps) {
  const [detail, setDetail] = useState<AuditLiveDetail | null>(null);
  const [pollError, setPollError] = useState("");
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  /** Never decrease while this modal session is open — prevents rewind flicker on job retries. */
  const [highWaterIdx, setHighWaterIdx] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const poll = useCallback(async () => {
    try {
      const data = await apiFetch<AuditLiveDetail>(`/audits/${auditRunId}`);
      setDetail(data);
      setPollError("");
    } catch (err) {
      setPollError(err instanceof Error ? err.message : "Error al consultar Ayni");
    }
  }, [auditRunId]);

  useEffect(() => {
    if (!open) return;
    setHighWaterIdx(0);
    setDetail(null);
    void poll();
    const t = window.setInterval(() => {
      void poll();
    }, 1500);
    return () => window.clearInterval(t);
  }, [open, poll]);

  useEffect(() => {
    const idx = phaseIndex(detail?.progressPhase);
    if (idx < 0) return;
    // If the report already exists, treat everything before attest as done.
    const reportFloor = detail?.resultCode || detail?.reportHash ? phaseIndex("report") : -1;
    const next = Math.max(idx, reportFloor);
    setHighWaterIdx(prev => Math.max(prev, next));
  }, [detail?.progressPhase, detail?.resultCode, detail?.reportHash]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  const terminal = isTerminal(detail);
  const currentIdx = Math.max(phaseIndex(detail?.progressPhase), highWaterIdx);
  const ok = passedResult(detail?.resultCode);

  const headerLine = useMemo(() => {
    if (!detail) return "Ayni está despertando…";
    if (detail.status === "failed" && detail.findings?.length) {
      return "Revisión lista — el registro del veredicto no se completó. Puedes ver el resultado abajo.";
    }
    if (detail.status === "failed" && detail.progressLabel) {
      // Prefer short human label; strip leaked RPC dumps if any slipped through.
      const label = detail.progressLabel;
      if (/alchemy|eth_call|viem@|Request body/i.test(label)) {
        return "No se pudo registrar el veredicto ahora. Reintenta en unos segundos.";
      }
      return label;
    }
    if (detail.progressLabel) return detail.progressLabel;
    return "Trabajando…";
  }, [detail]);

  const ask = async () => {
    if (!question.trim() || !detail) return;
    const q = question.trim();
    setQuestion("");
    setChat(prev => [...prev, { role: "user", content: q }]);
    setAsking(true);
    try {
      const res = await apiFetch<{ answer: string }>(`/audits/${auditRunId}/ask`, {
        method: "POST",
        body: { question: q },
      });
      setChat(prev => [...prev, { role: "assistant", content: res.answer }]);
    } catch (err) {
      setChat(prev => [
        ...prev,
        {
          role: "assistant",
          content: err instanceof Error ? err.message : "No pude responder ahora.",
        },
      ]);
    } finally {
      setAsking(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-xl">
        <div className="flex items-start gap-4 border-b border-border p-4 sm:p-6">
          <Image
            src={ayniAudit}
            alt="Ayni Auditor"
            width={96}
            height={96}
            className="size-20 shrink-0 rounded-xl object-cover sm:size-24"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Ayni Auditor</p>
            <h2 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">Revisión en vivo</h2>
            <p className="mt-1 text-sm text-muted-foreground">{headerLine}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Lote {lotId.slice(0, 8)} · {formatKg(declaredWeightGrams)} · {categoryCode}
            </p>
          </div>
          {terminal ? (
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cerrar
            </Button>
          ) : null}
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
          {pollError ? <p className="text-sm text-destructive">{pollError}</p> : null}

          <ol className="grid gap-2">
            {PHASES.map((phase, i) => {
              const phaseId = detail?.progressPhase ?? "queued";
              const active = !terminal && phaseId === phase.id;
              const failed = detail?.progressPhase === "failed" || detail?.status === "failed";
              // High-water: once a phase was reached, keep prior ones checked even if a retry
              // briefly reports an earlier phase from the server.
              const completed =
                (terminal && !failed && (phase.id === "done" || currentIdx >= i)) ||
                (!terminal && currentIdx > i) ||
                (terminal && failed && currentIdx > i) ||
                (!terminal && !active && highWaterIdx > i);
              return (
                <li
                  key={phase.id}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm ${
                    active ? "border-primary/40 bg-primary/5" : "border-border/60"
                  }`}
                >
                  {failed && active ? (
                    <XCircle className="size-4 shrink-0 text-destructive" />
                  ) : completed && !active ? (
                    <CheckCircle2 className="size-4 shrink-0 text-primary" />
                  ) : active ? (
                    <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
                  ) : (
                    <Circle className="size-4 shrink-0 text-muted-foreground/50" />
                  )}
                  <span className={active ? "font-medium text-foreground" : "text-muted-foreground"}>
                    {phase.label}
                  </span>
                </li>
              );
            })}
          </ol>

          {terminal && detail ? (
            <div className="space-y-4">
              <div
                className={`rounded-xl border p-4 ${
                  ok ? "border-primary/30 bg-primary/5" : "border-destructive/30 bg-destructive/5"
                }`}
              >
                <p className="font-display text-lg font-semibold">
                  {ok
                    ? "Ayni aprobó la revisión"
                    : detail.status === "failed"
                      ? "Ayni no pudo completar la auditoría"
                      : "Ayni no aprobó — se requiere revisión"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Resultado: <strong>{statusLabel(detail.resultCode ?? detail.status)}</strong>
                  {detail.resultCode === "warning" ? " (aviso leve; liquidación permitida)" : null}
                </p>
                {detail.status === "failed" && detail.progressLabel && !detail.findings.length ? (
                  <p className="mt-2 text-sm text-foreground">Motivo: {detail.progressLabel}</p>
                ) : null}
                {!ok && detail.findings.length ? (
                  <ul className="mt-3 space-y-2 text-sm">
                    {detail.findings.map(f => (
                      <li key={f.id} className="rounded-lg border border-border/80 bg-background/80 p-3">
                        <p className="font-medium">
                          {f.code} · {f.severity}
                        </p>
                        <p className="text-muted-foreground">
                          Declarado: {f.declaredValue ?? "—"} · Observado: {f.observedValue ?? "—"}
                        </p>
                        {f.explanation ? <p className="mt-1">{f.explanation}</p> : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <dl className="mt-3 grid gap-1 text-xs text-muted-foreground">
                  <div>
                    Código del informe: <code className="break-all text-foreground">{detail.reportHash ?? "—"}</code>
                  </div>
                  <div>
                    Comprobante:{" "}
                    {detail.explorerUrl ? (
                      <a href={detail.explorerUrl} target="_blank" rel="noreferrer" className="text-primary underline">
                        Ver movimiento
                      </a>
                    ) : (
                      <span>{detail.onchainTxHash ?? "No registrado en esta revisión"}</span>
                    )}
                  </div>
                </dl>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    downloadAuditPdf({
                      lotId,
                      detail,
                      declaredWeightGrams,
                      categoryCode,
                    })
                  }
                >
                  <Download className="size-4" />
                  Descargar constancia (PDF)
                </Button>
                <Button type="button" onClick={onClose}>
                  Volver a inspecciones
                </Button>
              </div>

              <div className="rounded-xl border border-border p-4">
                <p className="font-medium">¿Dudas sobre este resultado?</p>
                <p className="text-sm text-muted-foreground">
                  Pregúntale a Ayni por qué pasó o no pasó. No puede cambiar el veredicto ni el registro.
                </p>
                <div className="mt-3 max-h-48 space-y-2 overflow-y-auto">
                  {chat.map((m, i) => (
                    <div
                      key={`${m.role}-${i}`}
                      className={`rounded-lg px-3 py-2 text-sm ${
                        m.role === "user" ? "ml-8 bg-muted" : "mr-8 bg-primary/10"
                      }`}
                    >
                      {m.role === "assistant" ? (
                        <AyniMarkdown content={m.content} />
                      ) : (
                        <p className="m-0 whitespace-pre-wrap">{m.content}</p>
                      )}
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
                <form
                  className="mt-3 flex gap-2"
                  onSubmit={e => {
                    e.preventDefault();
                    void ask();
                  }}
                >
                  <Input
                    value={question}
                    onChange={e => setQuestion(e.target.value)}
                    placeholder={ok ? "Ej. ¿Qué revisaste exactamente en la foto?" : "Ej. ¿Por qué el peso no cuadró?"}
                    disabled={asking}
                  />
                  <Button type="submit" disabled={asking || !question.trim()} size="icon">
                    {asking ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  </Button>
                </form>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
