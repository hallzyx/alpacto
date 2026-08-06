export const siteConfig = {
  name: "Alpacto",
  shortName: "Alpacto",
  tagline: "Un pacto justo por cada fibra.",
  description:
    "Plataforma de comercio justo de fibra de alpaca: fondos en escrow, inspecciones con evidencia, auditoría Ayni y pagos onchain en Arbitrum. El productor acepta su liquidación antes de entregar.",
  locale: "es_PE",
  language: "es",
  ogImagePath: "/og-image.png",
  faviconPath: "/favicon.png",
  manifestPath: "/manifest.json",
  themeColor: "#145a59",
  backgroundColor: "#f6f9fa",
  keywords: [
    "Alpacto",
    "fibra de alpaca",
    "comercio justo",
    "escrow",
    "blockchain",
    "Arbitrum",
    "trazabilidad",
    "productor",
    "asociación",
    "inspector",
    "evidencia",
    "Ayni",
    "liquidación",
    "Perú",
  ],
} as const;

export function getSiteUrl(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    process.env.VERCEL_URL?.trim();

  if (!fromEnv) {
    return `http://localhost:${process.env.PORT || 3000}`;
  }

  if (fromEnv.startsWith("http://") || fromEnv.startsWith("https://")) {
    return fromEnv.replace(/\/$/, "");
  }

  return `https://${fromEnv.replace(/\/$/, "")}`;
}

export function absoluteUrl(path = "/"): string {
  const base = getSiteUrl();
  if (path === "/" || path === "") return base;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
