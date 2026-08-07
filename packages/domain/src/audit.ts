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

/** Convert basis points to a short percent string for humans (100 bps = 1%). */
export function formatBpsAsPercent(bps: number): string {
  const pct = bps / 100;
  return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(1)}%`;
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
          explanation: "No se pudo leer la balanza con claridad en la evidencia",
        },
      ],
      weightDeltaBps: null,
    };
  }

  const observedGrams = kgToGramsFromNumber(input.observedWeightKg);
  const deltaBps = weightDeltaBps(input.declaredWeightGrams, observedGrams);

  if (deltaBps > tolerance) {
    const declaredKg = gramsToKgString(input.declaredWeightGrams);
    const observedKg = gramsToKgString(observedGrams);
    const diffGrams =
      observedGrams > input.declaredWeightGrams
        ? observedGrams - input.declaredWeightGrams
        : input.declaredWeightGrams - observedGrams;
    const diffKg = gramsToKgString(diffGrams);
    const maxDiffGrams = (input.declaredWeightGrams * BigInt(tolerance)) / 10_000n;
    const maxDiffKg = gramsToKgString(maxDiffGrams <= 0n ? 1n : maxDiffGrams);
    findings.push({
      code: "WEIGHT_MISMATCH",
      severity: "critical",
      declaredValue: declaredKg,
      observedValue: observedKg,
      explanation:
        `En la foto de la balanza se lee ${observedKg} kg, pero en la inspección se declaró ${declaredKg} kg ` +
        `(${diffKg} kg de diferencia). Solo se admite hasta ~${maxDiffKg} kg de margen ` +
        `(${formatBpsAsPercent(tolerance)} del peso declarado).`,
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
      explanation: "La categoría del documento no coincide con la inspección",
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
