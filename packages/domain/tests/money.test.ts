import { describe, expect, it } from "vitest";
import {
  calculateSettlementPreview,
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
  it("uses integer math for FINE category demo", () => {
    const preview = calculateSettlementPreview({
      weightGrams: 41_500n,
      pricePenMinorPerKg: 2750n, // S/ 27.50
      qualityBonusPenMinorPerKg: 0n,
      associationFeeBps: 300,
      penPerUsdcMicros: 3_750_000n,
    });
    expect(preview.grossPenMinor).toBe(114_125n);
    expect(preview.feePenMinor).toBe(3_423n);
    expect(preview.netPenMinor).toBe(110_702n);
    expect(preview.producerUsdcUnits + preview.associationUsdcUnits).toBe(
      penToUsdc(preview.netPenMinor, 3_750_000n),
    );
  });
});
