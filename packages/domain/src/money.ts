/** PEN amounts in centavos (minor units). */
export type PenMinor = bigint;

/** USDC amounts in 6-decimal units. */
export type UsdcUnits = bigint;

/** FX rate: micros of PEN per 1 USDC (e.g. 3_750_000 = S/ 3.75 per USDC). */
export type PenPerUsdcMicros = bigint;

const GRAMS_PER_KG = 1000n;
const BPS_DENOM = 10_000n;
const USDC_SCALE = 1_000_000n;
const MICROS_SCALE = 1_000_000n;

/** Default Alpacto platform fee: 0.5% = 50 bps. */
export const DEFAULT_PLATFORM_FEE_BPS = 50;

export function kgToGrams(kg: number | string): bigint {
  const normalized = typeof kg === "string" ? kg.trim() : String(kg);
  if (!/^-?\d+(\.\d{1,3})?$/.test(normalized)) {
    throw new Error(`Invalid kg value: ${kg}`);
  }
  const [whole, frac = ""] = normalized.split(".");
  const padded = (frac + "000").slice(0, 3);
  const sign = whole.startsWith("-") ? -1n : 1n;
  const absWhole = whole.replace("-", "");
  return sign * (BigInt(absWhole) * GRAMS_PER_KG + BigInt(padded));
}

export function gramsToKgString(grams: bigint): string {
  const sign = grams < 0n ? "-" : "";
  const abs = grams < 0n ? -grams : grams;
  const whole = abs / GRAMS_PER_KG;
  const frac = abs % GRAMS_PER_KG;
  return `${sign}${whole}.${frac.toString().padStart(3, "0").replace(/0+$/, "") || "0"}`;
}

export function applyBps(amount: bigint, bps: number): bigint {
  return (amount * BigInt(bps)) / BPS_DENOM;
}

export function penToUsdc(
  penMinor: PenMinor,
  penPerUsdcMicros: PenPerUsdcMicros,
): UsdcUnits {
  if (penPerUsdcMicros <= 0n) {
    throw new Error("penPerUsdcMicros must be positive");
  }
  // pen_minor / 100 = PEN major; USDC = PEN / rate
  // usdc_units = pen_minor * 1e6 * 1e6 / (rate_micros * 100)
  return (penMinor * USDC_SCALE * MICROS_SCALE) / (penPerUsdcMicros * 100n);
}

export function usdcToPenMinor(
  usdcUnits: UsdcUnits,
  penPerUsdcMicros: PenPerUsdcMicros,
): PenMinor {
  return (usdcUnits * penPerUsdcMicros * 100n) / (USDC_SCALE * MICROS_SCALE);
}

export type SettlementPreviewInput = {
  weightGrams: bigint;
  pricePenMinorPerKg: bigint;
  qualityBonusPenMinorPerKg?: bigint;
  associationFeeBps: number;
  /** Platform fee in basis points (default 50 = 0.5%). */
  platformFeeBps?: number;
  penPerUsdcMicros: PenPerUsdcMicros;
};

export type SettlementPreview = {
  grossPenMinor: PenMinor;
  bonusPenMinor: PenMinor;
  /** Association fee in PEN minor. */
  feePenMinor: PenMinor;
  /** Platform fee in PEN minor. */
  platformFeePenMinor: PenMinor;
  /** Producer take-home in PEN minor (subtotal − fees). */
  netPenMinor: PenMinor;
  producerUsdcUnits: UsdcUnits;
  associationUsdcUnits: UsdcUnits;
  platformUsdcUnits: UsdcUnits;
};

/**
 * Split settlement three ways from gross subtotal:
 * associationFeeBps + platformFeeBps + producer remainder.
 * Escrow total = producer + association + platform ≈ penToUsdc(subtotal).
 */
export function calculateSettlementPreview(
  input: SettlementPreviewInput,
): SettlementPreview {
  const platformFeeBps = input.platformFeeBps ?? DEFAULT_PLATFORM_FEE_BPS;
  if (input.associationFeeBps < 0 || platformFeeBps < 0) {
    throw new Error("fee bps must be non-negative");
  }
  if (input.associationFeeBps + platformFeeBps >= 10_000) {
    throw new Error("combined fees must be less than 100%");
  }

  const bonusRate = input.qualityBonusPenMinorPerKg ?? 0n;
  const weightKgNumerator = input.weightGrams;
  const grossPenMinor =
    (weightKgNumerator * input.pricePenMinorPerKg) / GRAMS_PER_KG;
  const bonusPenMinor = (weightKgNumerator * bonusRate) / GRAMS_PER_KG;
  const subtotal = grossPenMinor + bonusPenMinor;
  const feePenMinor = applyBps(subtotal, input.associationFeeBps);
  const platformFeePenMinor = applyBps(subtotal, platformFeeBps);
  const netPenMinor = subtotal - feePenMinor - platformFeePenMinor;

  const totalUsdc = penToUsdc(subtotal, input.penPerUsdcMicros);
  const associationUsdcUnits = applyBps(totalUsdc, input.associationFeeBps);
  const platformUsdcUnits = applyBps(totalUsdc, platformFeeBps);
  const producerUsdcUnits = totalUsdc - associationUsdcUnits - platformUsdcUnits;

  return {
    grossPenMinor,
    bonusPenMinor,
    feePenMinor,
    platformFeePenMinor,
    netPenMinor,
    producerUsdcUnits,
    associationUsdcUnits,
    platformUsdcUnits,
  };
}

/** Escrow tope estimado para una meta de kg a una categoría (ej. FINE). */
export type OrderFundingEstimate = SettlementPreview & {
  weightGrams: bigint;
  categoryCode: string;
  /** Total USDC que saldrá del escrow (productor + asociación + plataforma). */
  escrowUsdcUnits: UsdcUnits;
  /** Cents USD a fondear (ceil para no quedar cortos). */
  budgetUsdCents: bigint;
};

export function estimateOrderFundingFromKg(input: {
  weightGrams: bigint;
  categoryCode: string;
  pricePenMinorPerKg: bigint;
  qualityBonusPenMinorPerKg?: bigint;
  associationFeeBps: number;
  platformFeeBps?: number;
  penPerUsdcMicros: PenPerUsdcMicros;
}): OrderFundingEstimate {
  if (input.weightGrams <= 0n) {
    throw new Error("weightGrams must be positive");
  }
  const preview = calculateSettlementPreview({
    weightGrams: input.weightGrams,
    pricePenMinorPerKg: input.pricePenMinorPerKg,
    qualityBonusPenMinorPerKg: input.qualityBonusPenMinorPerKg,
    associationFeeBps: input.associationFeeBps,
    platformFeeBps: input.platformFeeBps,
    penPerUsdcMicros: input.penPerUsdcMicros,
  });
  const escrowUsdcUnits =
    preview.producerUsdcUnits +
    preview.associationUsdcUnits +
    preview.platformUsdcUnits;
  // 1 USD cent = 10_000 USDC micro-units; ceil so escrow covers the estimate.
  const budgetUsdCents = (escrowUsdcUnits + 9_999n) / 10_000n;
  return {
    ...preview,
    weightGrams: input.weightGrams,
    categoryCode: input.categoryCode,
    escrowUsdcUnits,
    budgetUsdCents: budgetUsdCents > 0n ? budgetUsdCents : 1n,
  };
}
