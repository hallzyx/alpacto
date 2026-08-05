import { X } from "lucide-react";
import { Button } from "~~/components/ui/button";

export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  if (!message) return null;
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
      role="alert"
    >
      <p>{message}</p>
      {onDismiss ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-destructive hover:bg-destructive/20 hover:text-destructive"
          onClick={onDismiss}
        >
          <X className="size-4" />
          <span className="sr-only">Cerrar</span>
        </Button>
      ) : null}
    </div>
  );
}
