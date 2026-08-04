export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  if (!message) return null;
  return (
    <div className="alp-error" role="alert">
      <p>{message}</p>
      {onDismiss ? (
        <button type="button" className="alp-link-btn" onClick={onDismiss}>
          Cerrar
        </button>
      ) : null}
    </div>
  );
}
