"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, SendHorizontal, ShieldAlert, X } from "lucide-react";
import ayniAvatar from "~~/assets/ayni_avatar.png";
import ayniIcon from "~~/assets/ayni_icon.png";
import { AyniMarkdown } from "~~/components/alpacto/AyniMarkdown";
import { Button } from "~~/components/ui/button";
import { apiFetch, ApiError } from "~~/lib/api";
import { cn } from "~~/lib/utils";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type AyniChatConfig = {
  endpoint: string;
  subtitle: string;
  welcome: string;
  /** Show producer integrity-dispute banner when API returns anomaly. */
  enableIntegrityDispute?: boolean;
  extractLotId?: (pathname: string) => string | undefined;
  extractOrderId?: (pathname: string) => string | undefined;
};

function lotIdFromProducerPath(pathname: string): string | undefined {
  const m = pathname.match(/\/producer\/lots\/([0-9a-f-]{36})/i);
  return m?.[1];
}

function lotIdFromAnyPath(pathname: string): string | undefined {
  if (pathname.includes("/lots/")) {
    const m = pathname.match(/\/lots\/([0-9a-f-]{36})/i);
    return m?.[1];
  }
  return undefined;
}

function orderIdFromBuyerPath(pathname: string): string | undefined {
  const m = pathname.match(/\/buyer\/orders\/([0-9a-f-]{36})/i);
  return m?.[1];
}

function orderIdFromAnyPath(pathname: string): string | undefined {
  const m = pathname.match(/\/orders\/([0-9a-f-]{36})/i);
  return m?.[1];
}

const PRODUCER_WELCOME =
  "Hola, soy **Ayni**. Puedo explicar el flujo, consultar **tus lotes** (orden, campaña, liquidación), estimar kg disponibles en tus órdenes, y verificar que Postgres y la blockchain coincidan.\n\n¿Qué quieres saber?";

const ASSOCIATION_WELCOME =
  "Hola, soy **Ayni**. Puedo consultar **campañas, órdenes, lotes y disputas de tu asociación**, liquidaciones y hallazgos de auditoría. No resuelvo disputas ni registro lotes por chat — eso es el panel.\n\n¿Qué quieres revisar?";

const BUYER_WELCOME =
  "Hola, soy **Ayni**. Puedo consultar **tus órdenes**, fondeo/escrow, lotes que entran a ellas y precios de tus campañas. Para financiar, usa el botón de la orden.\n\n¿Qué necesitas?";

function historyForApi(messages: ChatMessage[], welcome: string): ChatMessage[] {
  return messages.filter((m, i) => !(i === 0 && m.role === "assistant" && m.content === welcome));
}

/** Dispatch from any page to open the floating Ayni chat. */
export const AYNI_OPEN_CHAT_EVENT = "ayni:open-chat";

export function openAyniChat() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AYNI_OPEN_CHAT_EVENT));
}

function AyniRoleChat({ config }: { config: AyniChatConfig }) {
  const pathname = usePathname() ?? "";
  const contextLotId = useMemo(() => config.extractLotId?.(pathname), [pathname, config.extractLotId]);
  const contextOrderId = useMemo(() => config.extractOrderId?.(pathname), [pathname, config.extractOrderId]);
  const welcomeMsg = useMemo<ChatMessage>(() => ({ role: "assistant", content: config.welcome }), [config.welcome]);

  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMsg]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [anomaly, setAnomaly] = useState<{ lotId: string; message: string } | null>(null);
  const [disputeBusy, setDisputeBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const closingRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setMessages([welcomeMsg]);
  }, [welcomeMsg]);

  useEffect(() => {
    function onOpenRequest() {
      closingRef.current = false;
      setClosing(false);
      setOpen(true);
    }
    window.addEventListener(AYNI_OPEN_CHAT_EVENT, onOpenRequest);
    return () => window.removeEventListener(AYNI_OPEN_CHAT_EVENT, onOpenRequest);
  }, []);

  function closeChat() {
    if (closingRef.current || !open) return;
    closingRef.current = true;
    setClosing(true);
    window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
      closingRef.current = false;
    }, 220);
  }

  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open, busy, anomaly]);

  useEffect(() => {
    if (open && !closing) textareaRef.current?.focus();
  }, [open, closing]);

  useEffect(() => {
    if (!open || closing) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeChat();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closing]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const contextHint = contextLotId
    ? `Lote ${contextLotId.slice(0, 8)}`
    : contextOrderId
      ? `Orden ${contextOrderId.slice(0, 8)}`
      : config.subtitle;

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setDraft("");
    setError("");
    setBusy(true);

    try {
      const res = await apiFetch<{ reply: string; anomaly?: { lotId: string; message: string } | null }>(
        config.endpoint,
        {
          method: "POST",
          body: {
            messages: historyForApi(nextMessages, config.welcome),
            contextLotId,
            contextOrderId,
            contextPath: pathname,
          },
        },
      );
      setMessages(prev => [...prev, { role: "assistant", content: res.reply }]);
      if (config.enableIntegrityDispute && res.anomaly) setAnomaly(res.anomaly);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : "No pude responder ahora.";
      setError(message);
      setMessages(prev => prev.slice(0, -1));
      setDraft(text);
    } finally {
      setBusy(false);
    }
  }

  async function openIntegrityDispute() {
    if (!anomaly?.lotId || disputeBusy) return;
    setDisputeBusy(true);
    setError("");
    try {
      await apiFetch(`/lots/${anomaly.lotId}/integrity-dispute`, {
        method: "POST",
        body: { note: anomaly.message },
      });
      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: "Listo: abrí una **disputa de integridad** para este lote. La asociación la verá en **Disputas**.",
        },
      ]);
      setAnomaly(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo abrir la disputa");
    } finally {
      setDisputeBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void send();
    }
  }

  const ui = (
    <>
      {open ? (
        <button
          type="button"
          aria-label="Cerrar chat"
          className={cn(
            "fixed inset-0 z-[100] cursor-default border-0 bg-slate-900/40 backdrop-blur-[2px] transition-opacity duration-200 ease-out",
            closing ? "opacity-0" : "opacity-100 animate-in fade-in duration-200",
          )}
          onClick={closeChat}
        />
      ) : null}

      <div className="pointer-events-none fixed bottom-0 right-0 z-[110] flex flex-col items-end gap-1">
        {open ? (
          <div
            className={cn(
              "pointer-events-auto mr-10 flex h-[min(37.4rem,calc(100dvh-11rem))] w-[min(30rem,calc(100vw-1rem))] origin-bottom-right flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-xl transition-all duration-200 ease-out sm:mr-14",
              closing
                ? "translate-y-2 scale-95 opacity-0"
                : "translate-y-0 scale-100 opacity-100 animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-200",
            )}
            role="dialog"
            aria-modal="true"
            aria-label="Chat con Ayni"
            onClick={e => e.stopPropagation()}
          >
            <header className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2.5">
              <Image src={ayniAvatar} alt="" width={36} height={36} className="size-9 rounded-full object-cover" />
              <div className="min-w-0 flex-1">
                <p className="m-0 truncate text-sm font-semibold leading-tight">Ayni</p>
                <p className="m-0 truncate text-xs text-muted-foreground">{contextHint}</p>
              </div>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Cerrar chat" onClick={closeChat}>
                <X className="h-4 w-4" />
              </Button>
            </header>

            {config.enableIntegrityDispute && anomaly ? (
              <div className="flex flex-col gap-2 border-b border-destructive/30 bg-destructive/10 px-3 py-2.5">
                <p className="m-0 flex items-start gap-2 text-xs text-destructive">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{anomaly.message}</span>
                </p>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={disputeBusy}
                  onClick={() => void openIntegrityDispute()}
                >
                  {disputeBusy ? "Abriendo…" : "Abrir disputa de integridad"}
                </Button>
              </div>
            ) : null}

            <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-3 py-3">
              {messages.map((m, i) => (
                <div
                  key={`${m.role}-${i}`}
                  className={cn("flex gap-2", m.role === "user" ? "justify-end" : "justify-start")}
                >
                  {m.role === "assistant" ? (
                    <Image
                      src={ayniAvatar}
                      alt=""
                      width={28}
                      height={28}
                      className="mt-0.5 size-7 shrink-0 rounded-full object-cover"
                    />
                  ) : null}
                  <div
                    className={cn(
                      "rounded-2xl px-3 py-2 text-sm",
                      m.role === "user"
                        ? "max-w-[85%] bg-primary text-primary-foreground"
                        : "max-w-[95%] bg-muted text-foreground",
                    )}
                  >
                    {m.role === "assistant" ? (
                      <AyniMarkdown content={m.content} />
                    ) : (
                      <p className="m-0 whitespace-pre-wrap">{m.content}</p>
                    )}
                  </div>
                </div>
              ))}
              {busy ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Ayni está pensando…
                </div>
              ) : null}
            </div>

            {error ? (
              <p className="m-0 border-t border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            ) : null}

            <footer className="border-t border-slate-200 bg-slate-50 p-2.5">
              <div className="flex items-end gap-2">
                <textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={onKeyDown}
                  rows={2}
                  disabled={busy}
                  placeholder="Escribe tu pregunta… (Ctrl+Enter para enviar)"
                  className="max-h-32 min-h-[2.75rem] flex-1 resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                />
                <Button
                  type="button"
                  size="icon"
                  disabled={busy || !draft.trim()}
                  aria-label="Enviar"
                  onClick={() => void send()}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
                </Button>
              </div>
            </footer>
          </div>
        ) : null}

        <button
          type="button"
          className="group pointer-events-auto relative -mr-3 transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:-mr-4"
          aria-label={open ? "Cerrar chat de Ayni" : "Abrir chat de Ayni"}
          aria-expanded={open}
          onClick={() => {
            if (open) closeChat();
            else setOpen(true);
          }}
        >
          <span className="relative block size-32 sm:size-40">
            <span
              aria-hidden
              className="absolute top-1/2 left-1/2 z-0 aspect-square h-[58%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-50 shadow-md"
            />
            <Image
              src={ayniIcon}
              alt=""
              fill
              sizes="(max-width: 640px) 128px, 160px"
              className="z-[1] object-contain"
              priority
            />
            <span
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-1/2 z-[2] aspect-square h-[58%] -translate-x-1/2 -translate-y-1/2 animate-[ayni-ring_2.6s_ease-in-out_infinite] rounded-full border-2 border-primary/80"
            />
          </span>
        </button>
      </div>
    </>
  );

  if (!mounted) return null;
  return createPortal(ui, document.body);
}

/** @deprecated Prefer AyniProducerChat — kept for guide deep-links. */
export function AyniGuideChat() {
  return (
    <AyniRoleChat
      config={{
        endpoint: "/ayni/producer-chat",
        subtitle: "Tu asistente de productor",
        welcome: PRODUCER_WELCOME,
        enableIntegrityDispute: true,
        extractLotId: lotIdFromProducerPath,
      }}
    />
  );
}

export function AyniProducerChat() {
  return (
    <AyniRoleChat
      config={{
        endpoint: "/ayni/producer-chat",
        subtitle: "Tu asistente de productor",
        welcome: PRODUCER_WELCOME,
        enableIntegrityDispute: true,
        extractLotId: lotIdFromProducerPath,
      }}
    />
  );
}

export function AyniAssociationChat() {
  return (
    <AyniRoleChat
      config={{
        endpoint: "/ayni/association-chat",
        subtitle: "Asistente de asociación",
        welcome: ASSOCIATION_WELCOME,
        extractLotId: lotIdFromAnyPath,
        extractOrderId: orderIdFromAnyPath,
      }}
    />
  );
}

export function AyniBuyerChat() {
  return (
    <AyniRoleChat
      config={{
        endpoint: "/ayni/buyer-chat",
        subtitle: "Asistente de comprador",
        welcome: BUYER_WELCOME,
        extractLotId: lotIdFromAnyPath,
        extractOrderId: orderIdFromBuyerPath,
      }}
    />
  );
}
