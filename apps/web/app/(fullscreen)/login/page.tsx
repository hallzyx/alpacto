"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthSplitLayout } from "~~/components/alpacto/AuthSplitLayout";
import { useAuth } from "~~/components/alpacto";
import { Button } from "~~/components/ui/button";
import { FieldSeparator } from "~~/components/ui/field";
import { cn } from "~~/lib/utils";

const DEMO_ROLES = [
  { email: "andes@demo.alpacto", label: "Comprador", role: "buyer" },
  { email: "carlos@demo.alpacto", label: "Inspector", role: "inspector" },
  { email: "alpasur@demo.alpacto", label: "Asociación", role: "association" },
  { email: "admin@demo.alpacto", label: "Admin", role: "admin" },
] as const;

/** Vertical rhythm between the three login sections. */
const SECTION_GAP = "gap-8";

export default function LoginPage() {
  const { demoLogin, user, goHome } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const onDemo = async (email: string) => {
    setError("");
    setBusy(email);
    try {
      await demoLogin(email);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión demo");
    } finally {
      setBusy(null);
    }
  };

  return (
    <AuthSplitLayout contentMaxWidth="sm">
      <div className={cn("flex w-full flex-col", SECTION_GAP)}>
        <section className="flex flex-col gap-0">
          <h1 className="font-display text-5xl leading-none font-semibold tracking-tight text-foreground sm:text-6xl">
            Alpacto
          </h1>
          <p className="-mt-1 text-balance text-base leading-tight text-muted-foreground sm:text-lg">
            Un pacto justo por cada fibra.
          </p>
        </section>

        {error ? (
          <div
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </div>
        ) : null}

        <section className="flex flex-col gap-3">
          {user ? (
            <Button type="button" className="w-full" size="lg" onClick={goHome}>
              Continuar como {user.name}
            </Button>
          ) : null}

          <Button asChild className="w-full" size="lg">
            <Link href="/auth/producer">Soy productor — crear cuenta</Link>
          </Button>
        </section>

        <section className="flex flex-col gap-4">
          <FieldSeparator className="my-0">Demo</FieldSeparator>
          <p className="text-center text-sm text-muted-foreground">Acceso demo por rol (seed local)</p>
          <div className="grid grid-cols-2 gap-2">
            {DEMO_ROLES.map(r => (
              <Button
                key={r.email}
                type="button"
                variant="outline"
                className={cn("w-full", busy !== null && busy !== r.email && "opacity-60")}
                disabled={busy !== null}
                onClick={() => void onDemo(r.email)}
              >
                {busy === r.email ? "…" : r.label}
              </Button>
            ))}
          </div>
        </section>
      </div>
    </AuthSplitLayout>
  );
}
