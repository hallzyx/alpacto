import Link from "next/link";
import { CircleHelp } from "lucide-react";

export function ProducerGuideLink() {
  return (
    <Link
      href="/producer/guide"
      className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted/40 hover:text-foreground"
    >
      <CircleHelp className="h-4 w-4 text-primary" />
      <span>¿Confundido? Revisa la guía</span>
    </Link>
  );
}
