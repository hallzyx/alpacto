"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Expand, Minus, Plus, RotateCcw, X } from "lucide-react";
import { Button } from "~~/components/ui/button";
import { cn } from "~~/lib/utils";

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.2;

export function AyniMermaid({ chart }: { chart: string }) {
  const reactId = useId().replace(/:/g, "");
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "neutral",
          fontFamily: "inherit",
        });
        const id = `ayni-mmd-${reactId}-${Math.random().toString(36).slice(2, 8)}`;
        const { svg: rendered } = await mermaid.render(id, chart.trim());
        if (!cancelled) {
          setSvg(rendered);
          setError("");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "No se pudo renderizar el diagrama");
          setSvg("");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chart, reactId]);

  if (error) {
    return (
      <pre className="my-2 overflow-x-auto rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs whitespace-pre-wrap text-destructive">
        {chart}
      </pre>
    );
  }

  if (!svg) {
    return <div className="my-2 h-24 animate-pulse rounded-lg bg-slate-200/60" />;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative my-3 block w-full cursor-zoom-in overflow-x-auto rounded-lg border border-slate-200 bg-white p-2 text-left transition hover:border-primary/50 hover:shadow-sm"
        aria-label="Ampliar diagrama"
        title="Clic para ampliar, hacer zoom y desplazarte"
      >
        <div
          className="ayni-mermaid pointer-events-none [&_svg]:mx-auto [&_svg]:max-w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <span className="pointer-events-none absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-md bg-slate-900/75 px-2 py-1 text-[10px] font-medium text-white opacity-0 transition group-hover:opacity-100">
          <Expand className="h-3 w-3" />
          Ampliar
        </span>
      </button>

      {mounted && open
        ? createPortal(<MermaidViewerModal svg={svg} onClose={() => setOpen(false)} />, document.body)
        : null}
    </>
  );
}

function MermaidViewerModal({ svg, onClose }: { svg: string; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);

  const clampZoom = useCallback((z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z)), []);

  const resetView = useCallback(() => {
    setScale(1);
    setTx(0);
    setTy(0);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setScale(s => clampZoom(s + delta));
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [clampZoom]);

  function onPointerDown(e: React.PointerEvent) {
    // Left or right button: pan while held
    if (e.button !== 0 && e.button !== 2) return;
    dragging.current = true;
    setIsDragging(true);
    last.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current) return;
    const dx = e.clientX - last.current.x;
    const dy = e.clientY - last.current.y;
    last.current = { x: e.clientX, y: e.clientY };
    setTx(v => v + dx);
    setTy(v => v + dy);
  }

  function onPointerUp(e: React.PointerEvent) {
    dragging.current = false;
    setIsDragging(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-slate-950/70 backdrop-blur-[2px]">
      <div className="flex shrink-0 items-center gap-2 border-b border-primary/20 bg-primary px-3 py-2 text-primary-foreground">
        <p className="m-0 min-w-0 flex-1 truncate text-sm font-medium">Diagrama — zoom y desplazar</p>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="text-primary-foreground hover:bg-white/15 hover:text-primary-foreground"
            aria-label="Alejar"
            onClick={() => setScale(s => clampZoom(s - ZOOM_STEP))}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <span className="w-12 text-center text-xs tabular-nums">{Math.round(scale * 100)}%</span>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="text-primary-foreground hover:bg-white/15 hover:text-primary-foreground"
            aria-label="Acercar"
            onClick={() => setScale(s => clampZoom(s + ZOOM_STEP))}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="text-primary-foreground hover:bg-white/15 hover:text-primary-foreground"
            aria-label="Restablecer vista"
            onClick={resetView}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="text-primary-foreground hover:bg-white/15 hover:text-primary-foreground"
            aria-label="Cerrar"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div
        ref={viewportRef}
        className={cn(
          "relative min-h-0 flex-1 touch-none select-none overflow-hidden bg-slate-100",
          isDragging ? "cursor-grabbing" : "cursor-grab",
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={e => e.preventDefault()}
        role="presentation"
      >
        <div
          className="absolute top-1/2 left-1/2 origin-center will-change-transform [&_svg]:max-w-none"
          style={{ transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(${scale})` }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <p className="pointer-events-none absolute bottom-3 left-1/2 m-0 -translate-x-1/2 rounded-full bg-primary/90 px-3 py-1 text-[11px] text-primary-foreground">
          Rueda = zoom · Arrastra (clic izq. o der.) = mover · Esc = cerrar
        </p>
      </div>

      <button type="button" className="sr-only" onClick={onClose} aria-label="Cerrar fondo">
        Cerrar
      </button>
    </div>
  );
}
