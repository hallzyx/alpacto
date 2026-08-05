"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2, SendHorizontal, X } from "lucide-react";
import ayniAvatar from "~~/assets/ayni_avatar.png";
import ayniIcon from "~~/assets/ayni_icon.png";
import { Button } from "~~/components/ui/button";
import { apiFetch, ApiError } from "~~/lib/api";
import { cn } from "~~/lib/utils";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const WELCOME_CONTENT =
  "Hola, soy **Ayni**. Puedo explicarte el flujo de tu fibra, palabras como *campaña*, *lote* u *orden*, y qué hacer si algo no cuadra.\n\n¿Qué quieres saber?";

const WELCOME: ChatMessage = {
  role: "assistant",
  content: WELCOME_CONTENT,
};

function historyForApi(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter((m, i) => !(i === 0 && m.role === "assistant" && m.content === WELCOME_CONTENT));
}

export function AyniGuideChat() {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const closingRef = useRef(false);

  useEffect(() => {
    setMounted(true);
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
  }, [messages, open, busy]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- closeChat uses current open/closing via refs
  }, [open, closing]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setDraft("");
    setError("");
    setBusy(true);

    try {
      const res = await apiFetch<{ reply: string }>("/ayni/guide-chat", {
        method: "POST",
        body: { messages: historyForApi(nextMessages) },
      });
      setMessages(prev => [...prev, { role: "assistant", content: res.reply }]);
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
              "pointer-events-auto mr-10 flex h-[min(28rem,calc(100dvh-11rem))] w-[min(24rem,calc(100vw-1rem))] origin-bottom-right flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-xl transition-all duration-200 ease-out sm:mr-14",
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
                <p className="m-0 truncate text-xs text-muted-foreground">Guía del productor</p>
              </div>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Cerrar chat" onClick={closeChat}>
                <X className="h-4 w-4" />
              </Button>
            </header>

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
                      "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                      m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                    )}
                  >
                    {m.role === "assistant" ? (
                      <div className="ayni-md [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_h1]:my-2 [&_h2]:my-2 [&_h3]:my-2 [&_strong]:font-semibold [&_a]:underline">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                      </div>
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
