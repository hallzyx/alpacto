"use client";

import type { TimelineEvent } from "~~/lib/types";

export function Timeline({ events }: { events: TimelineEvent[] }) {
  if (!events.length) {
    return <p className="text-sm text-muted-foreground">Sin eventos todavía.</p>;
  }

  return (
    <ol className="relative ml-0.5">
      {events.map((ev, i) => (
        <li key={`${ev.type}-${ev.at}-${i}`} className="relative pb-6 pl-6 last:pb-0">
          {i < events.length - 1 ? (
            <span className="absolute left-[4.5px] top-2.5 h-[calc(100%-6px)] w-px bg-border" aria-hidden />
          ) : null}
          <span
            className="absolute left-0 top-1 size-2.5 rounded-full border-2 border-primary bg-background"
            aria-hidden
          />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-sm font-medium leading-none">{ev.label}</p>
            <time className="text-xs text-muted-foreground" dateTime={ev.at}>
              {new Date(ev.at).toLocaleString("es-PE", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </time>
          </div>
        </li>
      ))}
    </ol>
  );
}
