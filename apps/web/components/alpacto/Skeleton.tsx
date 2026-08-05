import { Loader2 } from "lucide-react";

/** Page / gate loading indicator — centered spinner matching Alpacto theme. */
export function Skeleton({ className = "", rows: _rows = 3 }: { className?: string; rows?: number }) {
  return (
    <div
      className={`alp-loader flex h-[calc(100dvh-4rem)] w-full flex-col items-center justify-center gap-4 ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-label="Cargando"
    >
      <Loader2 className="alp-loader__icon size-9 animate-spin text-primary" strokeWidth={1.75} />
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Cargando…</p>
    </div>
  );
}
