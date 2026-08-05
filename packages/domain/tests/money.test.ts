import { describe, expect, it } from "vitest";
import {
  calculateSettlementPreview,
  DEFAULT_PLATFORM_FEE_BPS,
  estimateOrderFundingFromKg,
  kgToGrams,
  penToUsdc,
  usdcToPenMinor,
} from "../src/money.js";

describe("kgToGrams", () => {
  it("converts kg to integer grams", () => {
    expect(kgToGrams("42.5")).toBe(42_500n);
    expect(kgToGrams("41.6")).toBe(41_600n);
    expect(kgToGrams(1)).toBe(1000n);
  });
});

describe("penToUsdc", () => {
  const rate = 3_750_000n; // S/ 3.75 per USDC

  it("round-trips within one centavo after conversion", () => {
    const pen = 100_000n; // S/ 1000.00
    const usdc = penToUsdc(pen, rate);
    const back = usdcToPenMinor(usdc, rate);
    const diff = back > pen ? back - pen : pen - back;
    expect(diff).toBeLessThanOrEqual(1n);
  });
});

describe("calculateSettlementPreview", () => {
  it("splits FINE demo three ways with 3% association + 0.5% platform", () => {
    const preview = calculateSettlementPreview({
      weightGrams: 41_500n,
      pricePenMinorPerKg: 2750n, // S/ 27.50
      qualityBonusPenMinorPerKg: 0n,
      associationFeeBps: 300,
      platformFeeBps: DEFAULT_PLATFORM_FEE_BPS,
      penPerUsdcMicros: 3_750_000n,
    });
    expect(preview.grossPenMinor).toBe(114_125n);
    expect(preview.feePenMinor).toBe(3_423n); // 3%
    expect(preview.platformFeePenMinor).toBe(570n); // 0.5%
    expect(preview.netPenMinor).toBe(110_132n);
    expect(
      preview.producerUsdcUnits +
        preview.associationUsdcUnits +
        preview.platformUsdcUnits,
    ).toBe(penToUsdc(preview.grossPenMinor + preview.bonusPenMinor, 3_750_000n));
  });

  it("defaults platform fee to 0.5%", () => {
    const preview = calculateSettlementPreview({
      weightGrams: 1000n,
      pricePenMinorPerKg: 2750n,
      associationFeeBps: 300,
      penPerUsdcMicros: 3_750_000n,
    });
    expect(preview.platformFeePenMinor).toBe(13n); // floor(2750 * 50 / 10000)
    expect(preview.platformUsdcUnits).toBeGreaterThan(0n);
  });
});

describe("estimateOrderFundingFromKg", () => {
  it("maps kg target to escrow covering all three splits", () => {
    const est = estimateOrderFundingFromKg({
      weightGrams: 50_000n,
      categoryCode: "FINE",
      pricePenMinorPerKg: 2750n,
      associationFeeBps: 300,
      platformFeeBps: 50,
      penPerUsdcMicros: 3_750_000n,
    });
    expect(est.categoryCode).toBe("FINE");
    expect(est.escrowUsdcUnits).toBe(
      est.producerUsdcUnits + est.associationUsdcUnits + est.platformUsdcUnits,
    );
    expect(est.budgetUsdCents).toBeGreaterThan(0n);
  });
});
