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
  { id: "attest", label: "Attestation on-chain" },
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
  const findingsHtml =
    detail.findings.length === 0
      ? "<p>Sin hallazgos críticos.</p>"
      : `<ul>${detail.findings
          .map(
            (f: AuditFinding) =>
              `<li><strong>${f.code}</strong> (${f.severity}): declarado ${f.declaredValue ?? "—"} · observado ${f.observedValue ?? "—"}<br/><em>${f.explanation ?? ""}</em></li>`,
          )
          .join("")}</ul>`;

  const explorer =
    detail.explorerUrl ||
    (detail.onchainTxHash && !detail.onchainTxHash.startsWith("local-")
      ? `https://sepolia.arbiscan.io/tx/${detail.onchainTxHash}`
      : null);

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <title>Constancia Ayni Auditor — Lote ${lotId.slice(0, 8)}</title>
  <style>
    body { font-family: Georgia, serif; max-width: 720px; margin: 2rem auto; color: #0b1c2c; line-height: 1.45; }
    h1 { font-size: 1.5rem; }
    .meta { color: #445; font-size: 0.9rem; }
    .box { border: 1px solid #c9d4dc; border-radius: 8px; padding: 1rem; margin: 1rem 0; }
    .ok { background: #e8f6f1; }
    .warn { background: #fff8e6; }
    .bad { background: #fdecea; }
    a { color: #2a9d8f; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  <h1>Constancia — Ayni Auditor</h1>
  <p class="meta">Alpacto · Fibra justa · Generado ${new Date().toLocaleString("es-PE")}</p>
  <div class="box ${passedResult(detail.resultCode) ? "ok" : "bad"}">
    <p><strong>Resultado:</strong> ${statusLabel(detail.resultCode ?? detail.status)}</p>
    <p><strong>Lote:</strong> ${lotId}</p>
    <p><strong>Inspección:</strong> v${detail.inspectionVersion}</p>
    <p><strong>Declarado:</strong> ${formatKg(declaredWeightGrams)} · ${categoryCode}</p>
  </div>
  <div class="box">
    <p><strong>Report hash:</strong> <code>${detail.reportHash ?? "—"}</code></p>
    <p><strong>Tx on-chain:</strong> ${
      detail.onchainTxHash
        ? explorer
          ? `<a href="${explorer}">${detail.onchainTxHash}</a>`
          : detail.onchainTxHash
        : "No registrada en esta corrida (off-chain / skip)"
    }</p>
  </div>
  <h2>Hallazgos</h2>
  ${findingsHtml}
  <p class="meta">Documento de constancia del veredicto de Ayni. No sustituye la medición física del inspector.</p>
  <script>window.onload = () => { window.print(); }</script>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (!w) {
    const a = document.createElement("a");
    a.href = url;
    a.download = `ayni-audit-${lotId.slice(0, 8)}-v${detail.inspectionVersion}.html`;
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
    void poll();
    const t = window.setInterval(() => {
      void poll();
    }, 1500);
    return () => window.clearInterval(t);
  }, [open, poll]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  const terminal = isTerminal(detail);
  const currentIdx = phaseIndex(detail?.progressPhase);
  const ok = passedResult(detail?.resultCode);

  const headerLine = useMemo(() => {
    if (!detail) return "Ayni está despertando…";
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
              const active = !terminal && (detail?.progressPhase ?? "queued") === phase.id;
              const failed = detail?.progressPhase === "failed";
              const completed =
                (terminal && !failed && (phase.id === "done" || currentIdx >= i)) ||
                (!terminal && currentIdx > i) ||
                (terminal && failed && currentIdx > i);
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
                    Report hash: <code className="break-all text-foreground">{detail.reportHash ?? "—"}</code>
                  </div>
                  <div>
                    Tx:{" "}
                    {detail.explorerUrl ? (
                      <a href={detail.explorerUrl} target="_blank" rel="noreferrer" className="text-primary underline">
                        {detail.onchainTxHash}
                      </a>
                    ) : (
                      <span>{detail.onchainTxHash ?? "No registrada en esta corrida"}</span>
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
                  Pregúntale a Ayni por qué pasó o no pasó. No puede cambiar el veredicto ni la attestation.
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
