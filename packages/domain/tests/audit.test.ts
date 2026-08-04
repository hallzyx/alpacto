import { describe, expect, it } from "vitest";
import { compareAuditValues, weightDeltaBps } from "../src/audit.js";

describe("weightDeltaBps", () => {
  it("computes delta for 42.5 vs 41.5 kg", () => {
    expect(weightDeltaBps(42_500n, 41_500n)).toBe(235);
  });
});

describe("compareAuditValues", () => {
  it("flags REVIEW_REQUIRED for demo discrepancy", () => {
    const result = compareAuditValues({
      declaredWeightGrams: 42_500n,
      observedWeightKg: 41.5,
      declaredCategory: "FINE",
      observedCategory: "FINE",
      scaleReadable: true,
    });
    expect(result.resultCode).toBe("review_required");
    expect(result.findings[0]?.code).toBe("WEIGHT_MISMATCH");
  });

  it("passes within 1% tolerance", () => {
    const result = compareAuditValues({
      declaredWeightGrams: 41_600n,
      observedWeightKg: 41.5,
      declaredCategory: "FINE",
      observedCategory: "FINE",
      scaleReadable: true,
    });
    expect(result.resultCode).toBe("pass");
  });
});
