import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-1 items-center justify-center bg-background px-6">
      <div className="text-center">
        <h1 className="m-0 mb-1 text-6xl font-bold text-foreground">404</h1>
        <h2 className="m-0 text-2xl font-semibold text-foreground">Página no encontrada</h2>
        <p className="m-0 mb-4 text-muted-foreground">La página que buscas no existe.</p>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Ir al inicio
        </Link>
      </div>
    </div>
  );
}
