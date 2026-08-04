import { gramsToKgString } from "./money.js";

export const DEFAULT_WEIGHT_TOLERANCE_BPS = 100; // 1%

export type AuditResultCode = "pass" | "warning" | "review_required" | "unreadable";

export type AuditFinding = {
  code: string;
  severity: "info" | "warning" | "critical";
  declaredValue: string;
  observedValue: string;
  explanation: string;
};

export type CompareAuditInput = {
  declaredWeightGrams: bigint;
  observedWeightKg: number | null;
  declaredCategory: string;
  observedCategory?: string | null;
  weightToleranceBps?: number;
  scaleReadable?: boolean;
};

export type CompareAuditResult = {
  resultCode: AuditResultCode;
  findings: AuditFinding[];
  weightDeltaBps: number | null;
};

export function weightDeltaBps(declaredGrams: bigint, observedGrams: bigint): number {
  if (declaredGrams <= 0n) throw new Error("declaredGrams must be positive");
  const diff = observedGrams > declaredGrams ? observedGrams - declaredGrams : declaredGrams - observedGrams;
  return Number((diff * 10_000n) / declaredGrams);
}

export function kgToGramsFromNumber(kg: number): bigint {
  return BigInt(Math.round(kg * 1000));
}

export function compareAuditValues(input: CompareAuditInput): CompareAuditResult {
  const findings: AuditFinding[] = [];
  const tolerance = input.weightToleranceBps ?? DEFAULT_WEIGHT_TOLERANCE_BPS;

  if (input.scaleReadable === false || input.observedWeightKg == null) {
    return {
      resultCode: "unreadable",
      findings: [
        {
          code: "SCALE_UNREADABLE",
          severity: "critical",
          declaredValue: gramsToKgString(input.declaredWeightGrams),
          observedValue: "unknown",
          explanation: "Scale evidence could not be read reliably",
        },
      ],
      weightDeltaBps: null,
    };
  }

  const observedGrams = kgToGramsFromNumber(input.observedWeightKg);
  const deltaBps = weightDeltaBps(input.declaredWeightGrams, observedGrams);

  if (deltaBps > tolerance) {
    findings.push({
      code: "WEIGHT_MISMATCH",
      severity: "critical",
      declaredValue: gramsToKgString(input.declaredWeightGrams),
      observedValue: gramsToKgString(observedGrams),
      explanation: `Weight delta ${deltaBps} bps exceeds tolerance ${tolerance} bps`,
    });
  }

  if (
    input.observedCategory &&
    input.observedCategory.toUpperCase() !== input.declaredCategory.toUpperCase()
  ) {
    findings.push({
      code: "CATEGORY_MISMATCH",
      severity: "warning",
      declaredValue: input.declaredCategory,
      observedValue: input.observedCategory,
      explanation: "Classification document category differs from inspection",
    });
  }

  if (findings.some((f) => f.code === "WEIGHT_MISMATCH")) {
    return { resultCode: "review_required", findings, weightDeltaBps: deltaBps };
  }
  if (findings.length > 0) {
    return { resultCode: "warning", findings, weightDeltaBps: deltaBps };
  }
  return { resultCode: "pass", findings: [], weightDeltaBps: deltaBps };
}

export function auditResultCodeToOnchain(result: AuditResultCode): number {
  switch (result) {
    case "pass":
      return 0;
    case "warning":
      return 1;
    case "review_required":
      return 2;
    case "unreadable":
      return 3;
    default:
      return 3;
  }
}

export function isSettlementAllowed(resultCode: string | null | undefined): boolean {
  return resultCode === "pass" || resultCode === "warning";
}
