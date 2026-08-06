"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Coins,
  HandCoins,
  Landmark,
  Package,
  Scale,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import heroAltiplano from "~~/assets/landing-hero-altiplano.png";
import alpacaPortrait from "~~/assets/landing-alpaca-portrait.png";
import fiberTexture from "~~/assets/landing-fiber-texture.png";
import { Button } from "~~/components/ui/button";
import { cn } from "~~/lib/utils";

const PACT_STEPS = [
  {
    icon: Wallet,
    title: "Fondos asegurados",
    body: "El comprador aparta el dinero antes del acopio. Tu pago no depende de promesas.",
  },
  {
    icon: Package,
    title: "Lote registrado",
    body: "Tu fibra recibe un número y una evidencia. Cada paso deja huella verificable.",
  },
  {
    icon: ShieldCheck,
    title: "Ayni revisa",
    body: "Una auditoría automática compara foto, ficha y cálculo. No decide; solo avisa.",
  },
  {
    icon: Scale,
    title: "Tú decides",
    body: "Aceptas la liquidación o pides un nuevo pesaje. Nadie mueve tu dinero por ti.",
  },
  {
    icon: HandCoins,
    title: "Pago ejecutado",
    body: "Cuando aceptas, el contrato reparte el pago según las reglas acordadas.",
  },
] as const;

const FEATURES = [
  {
    icon: Sparkles,
    title: "Ayni Auditor",
    body: "Revisa consistencia de evidencia y cálculos. Recomienda, no autoriza pagos.",
  },
  {
    icon: Coins,
    title: "Escrow comercial",
    body: "Fondos USDC bloqueados en Arbitrum hasta que el productor acepta.",
  },
  {
    icon: BadgeCheck,
    title: "Consentimiento onchain",
    body: "Passkey y gas patrocinado: derechos reales sin MetaMask ni seed phrase.",
  },
  {
    icon: Landmark,
    title: "Trazabilidad versionada",
    body: "Inspecciones inmutables; cada corrección crea una nueva versión visible.",
  },
] as const;

const ROLES = [
  { label: "Productor", body: "Revisa y acepta tu pago en soles." },
  { label: "Asociación", body: "Registra lotes y coordina el acopio." },
  { label: "Inspector", body: "Pesa, clasifica y firma con evidencia." },
  { label: "Comprador", body: "Fondea la orden y garantiza el pago." },
] as const;

export default function LandingPage() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let ctx: { revert: () => void } | undefined;
    let cancelled = false;

    const run = async () => {
      const { gsap } = await import("gsap");
      const { ScrollTrigger } = await import("gsap/ScrollTrigger");
      if (cancelled || !rootRef.current) return;
      gsap.registerPlugin(ScrollTrigger);

      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      ctx = gsap.context(() => {
        // Hero entrance
        gsap.set(".lp-hero-title, .lp-hero-tag, .lp-hero-cta", { y: 28, autoAlpha: 0 });
        gsap.to(".lp-hero-title, .lp-hero-tag, .lp-hero-cta", {
          y: 0,
          autoAlpha: 1,
          duration: 0.9,
          stagger: 0.12,
          ease: "power3.out",
          delay: 0.1,
        });

        // Hero image reveal
        gsap.fromTo(
          ".lp-hero-media",
          { scale: 1.06, autoAlpha: 0 },
          { scale: 1, autoAlpha: 1, duration: 1.4, ease: "power2.out" },
        );

        // Section reveals on scroll
        gsap.utils.toArray<HTMLElement>(".lp-reveal").forEach(el => {
          gsap.fromTo(
            el,
            { y: 36, autoAlpha: 0 },
            {
              y: 0,
              autoAlpha: 1,
              duration: 0.8,
              ease: "power3.out",
              scrollTrigger: { trigger: el, start: "top 82%" },
            },
          );
        });

        // Pact steps cascade
        gsap.fromTo(
          ".lp-step",
          { y: 24, autoAlpha: 0 },
          {
            y: 0,
            autoAlpha: 1,
            duration: 0.6,
            stagger: 0.09,
            ease: "power2.out",
            scrollTrigger: { trigger: ".lp-steps", start: "top 80%" },
          },
        );
      }, rootRef);

      if (reduce) {
        ScrollTrigger.getAll().forEach(st => st.kill());
        gsap.set(".lp-reveal, .lp-step, .lp-hero-media, .lp-hero-title, .lp-hero-tag, .lp-hero-cta", {
          autoAlpha: 1,
          y: 0,
          scale: 1,
        });
      }
    };

    void run();
    return () => {
      cancelled = true;
      ctx?.revert();
    };
  }, []);

  return (
    <div ref={rootRef} className="lp relative min-h-svh overflow-x-clip bg-[#f6f9fa] text-[#0f2430]">
      {/* subtle fiber weave texture over the whole page */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[1] opacity-[0.06]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(105deg, transparent 0, transparent 9px, rgba(26,107,106,0.6) 9px, rgba(26,107,106,0.6) 10px)",
        }}
      />
      {/* ── Nav ─────────────────────────────────────────────── */}
      <header className="lp-nav absolute inset-x-0 top-0 z-40 border-b border-[#0f2430]/8 bg-[#f6f9fa]/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-3.5 rounded-[4px] bg-gradient-to-br from-[#1a6b6a] to-[#2a9d8f] shadow-[0_0_0_3px_rgba(42,157,143,0.18)]"
            />
            <span className="font-display text-lg font-semibold tracking-tight">Alpacto</span>
          </Link>
          <nav className="hidden items-center gap-8 text-sm text-[#41525e] md:flex">
            <a href="#como-funciona" className="transition hover:text-[#0f2430]">
              Cómo funciona
            </a>
            <a href="#vision" className="transition hover:text-[#0f2430]">
              Visión
            </a>
            <a href="#roles" className="transition hover:text-[#0f2430]">
              Roles
            </a>
          </nav>
          <Button asChild size="sm" className="bg-[#1a6b6a] text-white hover:bg-[#145a59]">
            <Link href="/login">Entrar</Link>
          </Button>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────── */}
      <section className="relative flex min-h-svh items-center overflow-hidden">
        <div aria-hidden className="absolute inset-0">
          <Image
            src={heroAltiplano}
            alt=""
            fill
            priority
            sizes="100vw"
            className="lp-hero-media object-cover opacity-0"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#f6f9fa] via-[#f6f9fa]/78 to-[#f6f9fa]/25" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#f6f9fa] via-transparent to-[#f6f9fa]/40" />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-6xl px-6 pt-28 pb-20">
          <div className="max-w-2xl">
            <p className="lp-hero-tag mb-4 inline-flex items-center gap-2 rounded-full border border-[#2a9d8f]/35 bg-[#2a9d8f]/12 px-3 py-1 text-xs font-medium uppercase tracking-[0.14em] text-[#155e5d]">
              Fibra de alpaca · Web 2.5
            </p>
            <h1 className="lp-hero-title font-display text-5xl leading-[0.98] font-semibold tracking-tight sm:text-7xl lg:text-8xl">
              Un pacto justo por{" "}
              <span className="bg-gradient-to-r from-[#1a6b6a] to-[#2a9d8f] bg-clip-text text-transparent">
                cada fibra
              </span>
            </h1>
            <p className="lp-hero-tag mt-6 max-w-xl text-lg leading-relaxed text-[#2d3f4a] sm:text-xl">
              El comprador asegura los fondos, cada pesaje queda con evidencia y responsable, y el productor acepta su
              liquidación antes de entregar. Arbitrum ejecuta las reglas.
            </p>
            <div className="lp-hero-cta mt-10 flex flex-wrap items-center gap-4">
              <Button asChild size="lg" className="bg-[#1a6b6a] text-white hover:bg-[#145a59]">
                <Link href="/login">
                  Entrar a Alpacto <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-[#0f2430]/20 bg-transparent text-[#0f2430] hover:bg-[#0f2430]/5"
              >
                <a href="#como-funciona">Ver cómo funciona</a>
              </Button>
            </div>
          </div>
        </div>

        <div
          aria-hidden
          className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 text-xs uppercase tracking-[0.3em] text-[#6b7d88]"
        >
          Desplázate
        </div>
      </section>

      {/* ── Visión / manifiesto ─────────────────────────────── */}
      <section id="vision" className="relative mx-auto max-w-6xl px-6 py-28">
        <div className="lp-reveal grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-[#155e5d]">Nuestra visión</p>
            <h2 className="font-display text-3xl leading-tight font-semibold tracking-tight sm:text-5xl">
              La infraestructura de liquidación justa para fibras naturales
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-[#2d3f4a]">
              Alpacto protege el valor de la fibra desde el pesaje hasta el pago: el comprador asegura los fondos, Ayni
              Auditor revisa la evidencia y el productor acepta una liquidación transparente sin tener que entender
              criptomonedas.
            </p>
            <blockquote className="mt-8 border-l-2 border-[#2a9d8f] pl-5 text-[#1e3a45] italic">
              “La IA recomienda, las personas autorizadas deciden y el contrato ejecuta.”
            </blockquote>
          </div>
          <div className="relative">
            <div className="relative overflow-hidden rounded-2xl border border-[#0f2430]/10 shadow-lg shadow-[#0f2430]/8">
              <Image
                src={alpacaPortrait}
                alt="Alpaca"
                className="h-auto w-full object-cover"
                sizes="(min-width: 1024px) 40vw, 100vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0f2430]/25 via-transparent to-transparent" />
            </div>
            <div
              aria-hidden
              className="absolute -inset-4 -z-10 rounded-3xl bg-gradient-to-br from-[#1a6b6a]/15 to-transparent blur-2xl"
            />
          </div>
        </div>
      </section>

      {/* ── Cómo funciona (pacto) ───────────────────────────── */}
      <section id="como-funciona" className="relative border-y border-[#0f2430]/6 bg-[#edf3f4] py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="lp-reveal max-w-2xl">
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-[#155e5d]">El pacto</p>
            <h2 className="font-display text-3xl leading-tight font-semibold tracking-tight sm:text-5xl">
              De tu fibra a tu pago, sin intermediarios invisibles
            </h2>
          </div>

          <ol className="lp-steps mt-16 grid gap-px overflow-hidden rounded-2xl border border-[#0f2430]/10 bg-[#0f2430]/8 sm:grid-cols-2 lg:grid-cols-5">
            {PACT_STEPS.map((step, i) => (
              <li
                key={step.title}
                className="lp-step group relative flex flex-col gap-4 bg-white p-6 transition hover:bg-[#f0f7f6]"
              >
                <span
                  aria-hidden
                  className="absolute right-4 top-4 font-display text-5xl font-semibold text-[#0f2430]/8"
                >
                  {i + 1}
                </span>
                <span className="flex size-11 items-center justify-center rounded-xl border border-[#2a9d8f]/25 bg-[#2a9d8f]/10 text-[#1a6b6a]">
                  <step.icon className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-semibold text-[#0f2430]">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#4a5d68]">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Qué es / no es ──────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-28">
        <div className="lp-reveal grid gap-12 lg:grid-cols-2 lg:items-center">
          <div className="relative order-2 lg:order-1">
            <div className="relative overflow-hidden rounded-2xl border border-[#0f2430]/10 shadow-lg shadow-[#0f2430]/8">
              <Image
                src={fiberTexture}
                alt="Fibra de alpaca"
                className="h-auto w-full object-cover"
                sizes="(min-width: 1024px) 45vw, 100vw"
              />
            </div>
            <div
              aria-hidden
              className="absolute -inset-4 -z-10 rounded-3xl bg-gradient-to-tr from-[#1a6b6a]/12 to-transparent blur-2xl"
            />
          </div>
          <div className="order-1 lg:order-2">
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-[#155e5d]">Qué es Alpacto</p>
            <h2 className="font-display text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
              No un marketplace. No una wallet. Un pacto verificable.
            </h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {FEATURES.map(f => (
                <div
                  key={f.title}
                  className={cn(
                    "rounded-xl border border-[#0f2430]/10 bg-white p-5",
                    "transition hover:border-[#2a9d8f]/40 hover:bg-[#2a9d8f]/6",
                  )}
                >
                  <f.icon className="h-5 w-5 text-[#1a6b6a]" />
                  <h3 className="mt-3 font-semibold text-[#0f2430]">{f.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-[#4a5d68]">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Roles ───────────────────────────────────────────── */}
      <section id="roles" className="relative border-t border-[#0f2430]/6 bg-[#edf3f4] py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="lp-reveal mx-auto max-w-2xl text-center">
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-[#155e5d]">Para quién</p>
            <h2 className="font-display text-3xl leading-tight font-semibold tracking-tight sm:text-5xl">
              Cuatro roles, un mismo pacto
            </h2>
            <p className="mt-5 text-[#4a5d68]">
              Cada actor ve solo lo que necesita, con explicaciones en soles y sin jerga cripto.
            </p>
          </div>
          <div className="lp-reveal mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {ROLES.map(r => (
              <div
                key={r.label}
                className="rounded-2xl border border-[#0f2430]/10 bg-white p-6 transition hover:border-[#2a9d8f]/40"
              >
                <h3 className="font-display text-lg font-semibold text-[#0f2430]">{r.label}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#4a5d68]">{r.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA final ───────────────────────────────────────── */}
      <section className="relative overflow-hidden py-32">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(80%_60%_at_50%_100%,rgba(42,157,143,0.14),transparent_70%)]"
        />
        <div className="lp-reveal relative mx-auto max-w-3xl px-6 text-center">
          <h2 className="font-display text-4xl leading-tight font-semibold tracking-tight sm:text-6xl">
            Que ningún pesaje se decida a espaldas del productor
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-lg text-[#2d3f4a]">
            Empieza con una orden financiada y una evidencia. El resto lo ejecuta el contrato.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Button asChild size="lg" className="bg-[#1a6b6a] text-white hover:bg-[#145a59]">
              <Link href="/login">
                Entrar <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-[#0f2430]/20 bg-transparent text-[#0f2430] hover:bg-[#0f2430]/5"
            >
              <Link href="/auth/producer">Soy productor — crear cuenta</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────── */}
      <footer className="border-t border-[#0f2430]/8 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 text-sm text-[#5c6f7a] sm:flex-row">
          <div className="flex items-center gap-2">
            <span aria-hidden className="size-3 rounded-[3px] bg-gradient-to-br from-[#1a6b6a] to-[#2a9d8f]" />
            <span className="font-display font-semibold text-[#0f2430]">Alpacto</span>
          </div>
          <p>Un pacto justo por cada fibra. MVP en Arbitrum Sepolia.</p>
        </div>
      </footer>
    </div>
  );
}
