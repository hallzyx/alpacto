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
  penPerUsdcMicros: PenPerUsdcMicros;
};

export type SettlementPreview = {
  grossPenMinor: PenMinor;
  bonusPenMinor: PenMinor;
  feePenMinor: PenMinor;
  netPenMinor: PenMinor;
  producerUsdcUnits: UsdcUnits;
  associationUsdcUnits: UsdcUnits;
};

export function calculateSettlementPreview(
  input: SettlementPreviewInput,
): SettlementPreview {
  const bonusRate = input.qualityBonusPenMinorPerKg ?? 0n;
  const weightKgNumerator = input.weightGrams;
  const grossPenMinor =
    (weightKgNumerator * input.pricePenMinorPerKg) / GRAMS_PER_KG;
  const bonusPenMinor = (weightKgNumerator * bonusRate) / GRAMS_PER_KG;
  const subtotal = grossPenMinor + bonusPenMinor;
  const feePenMinor = applyBps(subtotal, input.associationFeeBps);
  const netPenMinor = subtotal - feePenMinor;
  const totalUsdc = penToUsdc(netPenMinor, input.penPerUsdcMicros);
  const associationUsdcUnits = applyBps(totalUsdc, input.associationFeeBps);
  const producerUsdcUnits = totalUsdc - associationUsdcUnits;
  return {
    grossPenMinor,
    bonusPenMinor,
    feePenMinor,
    netPenMinor,
    producerUsdcUnits,
    associationUsdcUnits,
  };
}
