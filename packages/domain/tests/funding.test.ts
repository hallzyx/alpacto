import { describe, expect, it } from "vitest";
import {
  assertWithinDemoMaxUsdc,
  usdCentsToUsdcUnits,
} from "../src/funding.js";

describe("funding conversions", () => {
  it("maps $100 to 100 USDC units", () => {
    expect(usdCentsToUsdcUnits(10_000n)).toBe(100_000_000n);
  });

  it("enforces demo max in whole USDC", () => {
    expect(() => assertWithinDemoMaxUsdc(10_000_000_001n, 10_000n)).toThrow();
  });
});
