"use client";

import type { TimelineEvent } from "~~/lib/types";

export function Timeline({ events }: { events: TimelineEvent[] }) {
  if (!events.length) {
    return <p className="alp-muted">Sin eventos todavía.</p>;
  }

  return (
    <ol className="alp-timeline">
      {events.map((ev, i) => (
        <li key={`${ev.type}-${ev.at}-${i}`} className="alp-timeline__item">
          <div className="alp-timeline__dot" aria-hidden />
          <div className="alp-timeline__body">
            <p className="alp-timeline__label">{ev.label}</p>
            <time className="alp-timeline__time" dateTime={ev.at}>
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
