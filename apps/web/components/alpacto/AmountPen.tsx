import { formatPen } from "~~/lib/format";

export function AmountPen({
  minor,
  className = "",
  size = "md",
}: {
  minor: string | number | bigint | null | undefined;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  return <span className={`alp-amount alp-amount--${size} ${className}`.trim()}>{formatPen(minor)}</span>;
}
