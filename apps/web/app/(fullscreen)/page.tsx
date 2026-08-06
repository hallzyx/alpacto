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
import { AlpactoMark } from "~~/components/alpacto/AlpactoMark";
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
  {
    label: "Productor",
    body: "Revisa y acepta tu pago en soles.",
    image: "/roles/ayni_producer.png",
  },
  {
    label: "Asociación",
    body: "Registra lotes y coordina el acopio.",
    image: "/roles/ayni_association.png",
  },
  {
    label: "Inspector",
    body: "Pesa, clasifica y firma con evidencia.",
    image: "/roles/ayni_inspector.png?v=4",
  },
  {
    label: "Comprador",
    body: "Fondea la orden y garantiza el pago.",
    image: "/roles/ayni_buyer.png?v=4",
  },
] as const;

/** Soft cloud blobs: side + size/position for the entrance curtain */
const CLOUD_BLOBS: Array<{
  side: "left" | "right";
  w: string;
  h: string;
  top: string;
  left?: string;
  right?: string;
  opacity: number;
}> = [
  { side: "left", w: "52vw", h: "42vh", top: "2%", left: "-8%", opacity: 0.92 },
  { side: "left", w: "44vw", h: "36vh", top: "28%", left: "-14%", opacity: 0.85 },
  { side: "left", w: "48vw", h: "40vh", top: "55%", left: "-10%", opacity: 0.88 },
  { side: "left", w: "38vw", h: "28vh", top: "12%", left: "8%", opacity: 0.7 },
  { side: "left", w: "36vw", h: "32vh", top: "68%", left: "4%", opacity: 0.75 },
  { side: "right", w: "54vw", h: "44vh", top: "0%", right: "-10%", opacity: 0.9 },
  { side: "right", w: "46vw", h: "38vh", top: "30%", right: "-12%", opacity: 0.84 },
  { side: "right", w: "50vw", h: "42vh", top: "58%", right: "-8%", opacity: 0.88 },
  { side: "right", w: "40vw", h: "30vh", top: "14%", right: "6%", opacity: 0.72 },
  { side: "right", w: "38vw", h: "34vh", top: "70%", right: "2%", opacity: 0.78 },
  { side: "left", w: "34vw", h: "26vh", top: "40%", left: "18%", opacity: 0.55 },
  { side: "right", w: "32vw", h: "24vh", top: "42%", right: "16%", opacity: 0.55 },
];

/** Ambient drift clouds while scrolling (altitude → surface) */
type DriftCloud = {
  dir: "ltr" | "rtl";
  top: string;
  w: number;
  h: number;
  opacity: number;
  duration: number;
  delay: number;
};

const HERO_DRIFT_OPACITY_BOOST = 1.2;

/** Hero-only — clipped to the hero section, boosted opacity */
const HERO_DRIFT_CLOUDS: DriftCloud[] = [
  { dir: "ltr", top: "10%", w: 360, h: 120, opacity: 0.69, duration: 16, delay: 0 },
  { dir: "rtl", top: "22%", w: 300, h: 100, opacity: 0.6, duration: 18, delay: 0.5 },
  { dir: "ltr", top: "38%", w: 420, h: 140, opacity: 0.53, duration: 20, delay: 1 },
  { dir: "ltr", top: "15%", w: 220, h: 70, opacity: 0.48, duration: 13, delay: 2 },
  { dir: "rtl", top: "58%", w: 320, h: 110, opacity: 0.55, duration: 15, delay: 0.2 },
];

/** Page-wide fixed layer — unchanged opacity below the hero */
const LOWER_DRIFT_CLOUDS: DriftCloud[] = [
  { dir: "rtl", top: "52%", w: 320, h: 110, opacity: 0.63, duration: 15, delay: 0.2 },
  { dir: "ltr", top: "68%", w: 280, h: 90, opacity: 0.5, duration: 17, delay: 1.5 },
  { dir: "rtl", top: "78%", w: 380, h: 130, opacity: 0.56, duration: 19, delay: 0.8 },
  { dir: "rtl", top: "45%", w: 260, h: 85, opacity: 0.45, duration: 14, delay: 2.5 },
  { dir: "ltr", top: "60%", w: 340, h: 115, opacity: 0.5, duration: 16, delay: 1.2 },
  { dir: "rtl", top: "88%", w: 300, h: 95, opacity: 0.44, duration: 12, delay: 0.4 },
];

function driftCloudBackground(index: number) {
  return index % 2 === 0
    ? "radial-gradient(ellipse at center, rgba(255,255,255,0.98) 0%, rgba(180,220,215,0.88) 38%, transparent 68%)"
    : "radial-gradient(ellipse at center, rgba(255,255,255,0.96) 0%, rgba(160,210,205,0.82) 42%, transparent 70%)";
}

/** Hero: white-dominant mist — only a whisper of brand teal on the fringe */
function heroDriftCloudBackground(index: number) {
  return index % 2 === 0
    ? "radial-gradient(ellipse at center, rgba(255,255,255,1) 0%, rgba(255,255,255,0.9) 32%, rgba(244,250,249,0.42) 50%, transparent 72%)"
    : "radial-gradient(ellipse at center, rgba(255,255,255,0.99) 0%, rgba(253,254,254,0.86) 36%, rgba(238,246,245,0.3) 54%, transparent 74%)";
}

function setupDriftAnimations(gsap: typeof import("gsap").gsap, selector: string, clouds: DriftCloud[]) {
  const drifts = gsap.utils.toArray<HTMLElement>(selector);

  drifts.forEach((el, i) => {
    const cfg = clouds[i];
    if (!cfg) return;

    const startFrac = (i % 5) / 5;
    const fromX = cfg.dir === "ltr" ? -30 : 110;
    const toX = cfg.dir === "ltr" ? 110 : -30;
    const startX = `${fromX + (toX - fromX) * startFrac}vw`;

    gsap.set(el, { x: startX, y: 0 });
    gsap.to(el, {
      x: `${toX}vw`,
      duration: cfg.duration * (1 - startFrac),
      delay: cfg.delay,
      ease: "none",
      onComplete: () => {
        gsap.set(el, { x: `${fromX}vw` });
        gsap.to(el, {
          x: `${toX}vw`,
          duration: cfg.duration,
          ease: "none",
          repeat: -1,
        });
      },
    });
    gsap.to(el, {
      y: i % 2 === 0 ? 14 : -12,
      duration: 6 + (i % 4),
      ease: "sine.inOut",
      yoyo: true,
      repeat: -1,
      delay: cfg.delay * 0.2,
    });
  });
}

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
        const cloudLayer = rootRef.current?.querySelector(".lp-clouds");
        const leftClouds = gsap.utils.toArray<HTMLElement>(".lp-cloud-left");
        const rightClouds = gsap.utils.toArray<HTMLElement>(".lp-cloud-right");
        const veil = rootRef.current?.querySelector(".lp-cloud-veil");

        // Content starts hidden via CSS; set entrance offsets
        gsap.set(".lp-hero-title, .lp-hero-tag, .lp-hero-cta", { y: 28, autoAlpha: 0 });
        gsap.set(".lp-nav", { y: -12, autoAlpha: 0 });

        if (reduce) {
          if (cloudLayer) gsap.set(cloudLayer, { autoAlpha: 0, pointerEvents: "none" });
          gsap.set(".lp-nav, .lp-hero-title, .lp-hero-tag, .lp-hero-cta", { y: 0, autoAlpha: 1 });
          gsap.set(".lp-hero-media", { scale: 1, autoAlpha: 1 });
          rootRef.current?.classList.add("lp-ready");
        } else {
          const intro = gsap.timeline({
            defaults: { ease: "power2.inOut" },
            onStart: () => rootRef.current?.classList.add("lp-ready"),
          });

          // Brief hold so the mist reads as a curtain
          intro.to({}, { duration: 0.4 });

          // Clouds drift outward and dissolve
          intro.to(
            leftClouds,
            {
              xPercent: -130,
              x: "-14vw",
              scale: 1.15,
              autoAlpha: 0,
              duration: 1.9,
              stagger: { each: 0.05, from: "center" },
              ease: "power3.inOut",
            },
            0.4,
          );
          intro.to(
            rightClouds,
            {
              xPercent: 130,
              x: "14vw",
              scale: 1.15,
              autoAlpha: 0,
              duration: 1.9,
              stagger: { each: 0.05, from: "center" },
              ease: "power3.inOut",
            },
            0.4,
          );
          // Solid veil fades as the gap opens
          if (veil) intro.to(veil, { autoAlpha: 0, duration: 1.15, ease: "power2.out" }, 0.55);
          if (cloudLayer) {
            intro.to(
              cloudLayer,
              {
                autoAlpha: 0,
                duration: 0.35,
                onComplete: () => {
                  if (cloudLayer instanceof HTMLElement) {
                    cloudLayer.style.display = "none";
                    cloudLayer.style.pointerEvents = "none";
                  }
                },
              },
              "-=0.35",
            );
          }

          // Hero + nav reveal as the sky opens
          intro.to(".lp-nav", { y: 0, autoAlpha: 1, duration: 0.7, ease: "power3.out" }, 0.85);
          intro.to(
            ".lp-hero-title, .lp-hero-tag, .lp-hero-cta",
            {
              y: 0,
              autoAlpha: 1,
              duration: 0.9,
              stagger: 0.12,
              ease: "power3.out",
            },
            1.0,
          );
          intro.fromTo(
            ".lp-hero-media",
            { scale: 1.06, autoAlpha: 0 },
            { scale: 1, autoAlpha: 1, duration: 1.4, ease: "power2.out" },
            0.65,
          );
        }

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

        // ── Altitude descent: drift clouds + approach surface ──
        if (!reduce) {
          const driftLayer = rootRef.current?.querySelector(".lp-altitude");
          const ground = rootRef.current?.querySelector(".lp-ground");

          setupDriftAnimations(gsap, ".lp-drift-hero", HERO_DRIFT_CLOUDS);
          setupDriftAnimations(gsap, ".lp-drift-lower", LOWER_DRIFT_CLOUDS);

          // As you scroll down: fewer / fainter clouds (descending altitude)
          // Keep a visible floor so clouds don't vanish mid-page
          if (driftLayer) {
            gsap.fromTo(
              driftLayer,
              { autoAlpha: 1 },
              {
                autoAlpha: 0.25,
                ease: "none",
                scrollTrigger: {
                  trigger: rootRef.current,
                  start: "top top",
                  end: "bottom bottom",
                  scrub: 1.2,
                },
              },
            );
          }

          // Soft rise of hill silhouettes only — ground color stays always visible
          if (ground) {
            gsap.fromTo(
              ground,
              { yPercent: 12 },
              {
                yPercent: 0,
                ease: "none",
                scrollTrigger: {
                  trigger: ".lp-footer",
                  start: "top 90%",
                  end: "top 45%",
                  scrub: 0.8,
                },
              },
            );
          }

          // Atmosphere cools from high sky → warmer ground haze
          const atmosphere = rootRef.current?.querySelector(".lp-atmosphere");
          if (atmosphere) {
            gsap.fromTo(
              atmosphere,
              { autoAlpha: 0 },
              {
                autoAlpha: 1,
                ease: "none",
                scrollTrigger: {
                  trigger: rootRef.current,
                  start: "55% top",
                  end: "bottom bottom",
                  scrub: 1,
                },
              },
            );
          }
        } else {
          gsap.set(".lp-altitude, .lp-altitude-hero", { autoAlpha: 0 });
          gsap.set(".lp-ground", { autoAlpha: 1, yPercent: 0 });
        }
      }, rootRef);

      if (reduce) {
        ScrollTrigger.getAll().forEach(st => st.kill());
        gsap.set(".lp-reveal, .lp-step, .lp-hero-media, .lp-hero-title, .lp-hero-tag, .lp-hero-cta, .lp-nav", {
          autoAlpha: 1,
          y: 0,
          scale: 1,
        });
      }
    };

    void run();

    // Failsafe: never leave the page blank if GSAP fails to load
    const failsafe = window.setTimeout(() => {
      if (!rootRef.current || rootRef.current.classList.contains("lp-ready")) return;
      rootRef.current.classList.add("lp-ready");
      const clouds = rootRef.current.querySelector(".lp-clouds");
      if (clouds instanceof HTMLElement) clouds.style.display = "none";
    }, 3500);

    return () => {
      cancelled = true;
      window.clearTimeout(failsafe);
      ctx?.revert();
    };
  }, []);

  return (
    <div ref={rootRef} className="lp relative min-h-svh overflow-x-clip bg-[#f6f9fa] text-[#0f2430]">
      {/* Opaque cloud curtain from first paint — hides FOUC until GSAP parts it */}
      <div aria-hidden className="lp-clouds fixed inset-0 z-[60] overflow-hidden">
        {/* Solid veil: content never peeks through before intro */}
        <div className="lp-cloud-veil absolute inset-0 bg-[#eef4f5]" />
        {/* Soft left / right mist banks */}
        <div className="lp-cloud-left absolute inset-y-0 left-0 w-[58%] bg-gradient-to-r from-[#f6f9fa] via-[#e8f2f2] to-transparent" />
        <div className="lp-cloud-right absolute inset-y-0 right-0 w-[58%] bg-gradient-to-l from-[#f6f9fa] via-[#e8f2f2] to-transparent" />
        {CLOUD_BLOBS.map((cloud, i) => (
          <span
            key={i}
            className={cn(
              "lp-cloud absolute rounded-[50%] blur-[52px] will-change-transform",
              cloud.side === "left" ? "lp-cloud-left" : "lp-cloud-right",
            )}
            style={{
              width: cloud.w,
              height: cloud.h,
              top: cloud.top,
              left: cloud.left,
              right: cloud.right,
              opacity: cloud.opacity,
              background:
                i % 3 === 0
                  ? "radial-gradient(ellipse at center, rgba(255,255,255,1) 0%, rgba(232,242,243,0.9) 45%, transparent 72%)"
                  : i % 3 === 1
                    ? "radial-gradient(ellipse at center, rgba(246,249,250,1) 0%, rgba(210,230,228,0.85) 50%, transparent 74%)"
                    : "radial-gradient(ellipse at center, rgba(255,255,255,0.98) 0%, rgba(220,235,236,0.88) 48%, transparent 70%)",
            }}
          />
        ))}
      </div>

      {/* Ambient drift clouds — fixed layer for sections below the hero */}
      <div aria-hidden className="lp-altitude pointer-events-none fixed inset-0 z-[8] overflow-hidden">
        {LOWER_DRIFT_CLOUDS.map((c, i) => (
          <span
            key={i}
            className="lp-drift-lower absolute rounded-[50%] blur-[28px] will-change-transform"
            style={{
              top: c.top,
              width: c.w,
              height: c.h,
              opacity: c.opacity,
              background: driftCloudBackground(i),
            }}
          />
        ))}
      </div>

      {/* Ground haze that grows as altitude drops */}
      <div
        aria-hidden
        className="lp-atmosphere pointer-events-none fixed inset-0 z-[1] opacity-0"
        style={{
          background:
            "linear-gradient(to top, rgba(26, 107, 106, 0.2) 0%, rgba(42, 157, 143, 0.1) 28%, transparent 55%)",
        }}
      />

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
      <header className="lp-nav absolute inset-x-0 top-0 z-40 bg-transparent">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <AlpactoMark size="sm" />
            <span className="font-display text-[1.5625rem] leading-none font-semibold tracking-tight text-[#0a1c26] [text-shadow:0_1px_12px_rgba(246,249,250,0.9)]">
              Alpacto
            </span>
          </Link>
          <nav className="hidden items-center gap-8 text-sm font-medium text-[#0f2430] md:flex">
            <a
              href="#como-funciona"
              className="transition hover:text-[#1a6b6a] [text-shadow:0_1px_10px_rgba(246,249,250,0.85)]"
            >
              Cómo funciona
            </a>
            <a
              href="#vision"
              className="transition hover:text-[#1a6b6a] [text-shadow:0_1px_10px_rgba(246,249,250,0.85)]"
            >
              Visión
            </a>
            <a
              href="#roles"
              className="transition hover:text-[#1a6b6a] [text-shadow:0_1px_10px_rgba(246,249,250,0.85)]"
            >
              Roles
            </a>
          </nav>
          <Button
            asChild
            className="h-10 gap-2 bg-[#1a6b6a] px-4 text-sm font-medium text-white shadow-md hover:bg-[#145a59]"
          >
            <Link href="/login">
              Vamos allá <ArrowRight className="h-4 w-4" />
            </Link>
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

        <div aria-hidden className="lp-altitude-hero pointer-events-none absolute inset-0 z-[5] overflow-hidden">
          {HERO_DRIFT_CLOUDS.map((c, i) => (
            <span
              key={i}
              className="lp-drift-hero absolute rounded-[50%] blur-[34px] will-change-transform"
              style={{
                top: c.top,
                width: c.w,
                height: c.h,
                opacity: Math.min(1, c.opacity * HERO_DRIFT_OPACITY_BOOST),
                background: heroDriftCloudBackground(i),
              }}
            />
          ))}
        </div>

        <div className="relative z-20 mx-auto w-full max-w-6xl px-6 pt-28 pb-20">
          <div className="max-w-2xl">
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
                  className="absolute right-4 top-4 font-display text-5xl font-semibold text-[#1a6b6a]/22"
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
          <div className="lp-reveal mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {ROLES.map(r => (
              <div
                key={r.label}
                className="group flex flex-col overflow-hidden rounded-2xl border border-[#0f2430]/10 bg-white shadow-sm transition hover:-translate-y-1 hover:border-[#2a9d8f]/40 hover:shadow-md"
              >
                <div className="relative aspect-[4/5] w-full overflow-hidden bg-gradient-to-b from-[#dff3f0] via-[#eef8f7] to-white">
                  <div
                    aria-hidden
                    className="pointer-events-none absolute left-1/2 top-8 size-40 -translate-x-1/2 rounded-full bg-[#2a9d8f]/20 blur-2xl"
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={r.image}
                    alt={`Avatar ${r.label}`}
                    className="absolute inset-0 z-[1] h-full w-full object-contain object-bottom p-3 transition duration-500 group-hover:scale-[1.04]"
                    loading="eager"
                    decoding="async"
                  />
                </div>
                <div className="flex flex-1 flex-col px-5 pb-5 pt-3">
                  <h3 className="font-display text-lg font-semibold text-[#0f2430]">{r.label}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-[#4a5d68]">{r.body}</p>
                </div>
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

      {/* ── Footer = superficie en verde de marca ───────────── */}
      <footer className="lp-footer relative z-10 overflow-hidden bg-[#145a59]">
        <div aria-hidden className="lp-ground pointer-events-none absolute inset-0">
          {/* Brand teal earth — always visible */}
          <div
            className="absolute inset-0"
            style={{
              background: "linear-gradient(180deg, #1a6b6a 0%, #145a59 32%, #0f4847 68%, #0a3534 100%)",
            }}
          />
          {/* Soft mint wash */}
          <div
            className="absolute inset-0 opacity-35"
            style={{
              background: "radial-gradient(120% 80% at 50% 100%, rgba(42,157,143,0.22) 0%, transparent 55%)",
            }}
          />
          {/* Hill silhouettes in deeper brand teal */}
          <svg
            className="absolute bottom-0 left-0 h-full w-full"
            viewBox="0 0 1440 160"
            preserveAspectRatio="none"
            aria-hidden
          >
            <path
              fill="rgba(10, 53, 52, 0.55)"
              d="M0,70 C200,30 340,95 520,60 C700,25 860,10 1040,45 C1220,80 1340,40 1440,55 L1440,160 L0,160 Z"
            />
            <path
              fill="rgba(6, 40, 39, 0.7)"
              d="M0,100 C240,70 420,120 600,95 C820,65 980,90 1180,80 C1320,74 1400,95 1440,90 L1440,160 L0,160 Z"
            />
          </svg>
          <div
            className="absolute inset-x-0 bottom-0 h-16 opacity-25"
            style={{
              backgroundImage:
                "repeating-linear-gradient(100deg, transparent 0, transparent 14px, rgba(255,255,255,0.12) 14px, rgba(255,255,255,0.12) 15px)",
            }}
          />
        </div>

        <div className="relative mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-14 text-sm sm:flex-row">
          <div className="inline-flex items-center gap-2.5">
            <AlpactoMark size="sm" onDark />
            <span className="font-display text-[1.40625rem] leading-none font-semibold text-white">Alpacto</span>
          </div>
          <p className="text-center text-[#d4efeb] sm:text-right">Plataforma Impulsada con Arbitrum</p>
        </div>
      </footer>
    </div>
  );
}
