export function Skeleton({ className = "", rows = 3 }: { className?: string; rows?: number }) {
  return (
    <div className={`alp-skeleton-stack ${className}`.trim()} aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="alp-skeleton" style={{ width: `${88 - i * 12}%` }} />
      ))}
    </div>
  );
}
