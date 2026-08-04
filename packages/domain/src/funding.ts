import type { UsdcUnits } from "./money.js";

/** USDC has 6 decimals; demo conversion is 1 USD cent → 10_000 micro-units. */
const USDC_UNITS_PER_USD_CENT = 10_000n;

export function usdCentsToUsdcUnits(usdCents: bigint): UsdcUnits {
  if (usdCents <= 0n) {
    throw new Error("usdCents must be positive");
  }
  return usdCents * USDC_UNITS_PER_USD_CENT;
}

/** `maxUsdc` is whole USDC (e.g. 10_000 = $10k cap). */
export function assertWithinDemoMaxUsdc(
  usdcUnits: UsdcUnits,
  maxUsdcWhole: bigint,
): void {
  const maxUnits = maxUsdcWhole * 1_000_000n;
  if (usdcUnits > maxUnits) {
    throw new Error(
      `Funding amount ${usdcUnits} exceeds demo max ${maxUnits} USDC units`,
    );
  }
}
