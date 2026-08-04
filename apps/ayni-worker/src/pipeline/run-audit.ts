import { and, desc, eq } from "drizzle-orm";
import {
  auditFindings,
  auditRuns,
  campaigns,
  evidenceFiles,
  inspections,
  lots,
  orders,
  pricingCategories,
  pricingPolicies,
  users,
  type Database,
} from "@alpacto/database";
import {
  auditResultCodeToOnchain,
  calculateSettlementPreview,
  compareAuditValues,
  type AuditResultCode,
} from "@alpacto/domain";
import { createHash } from "node:crypto";
import { keccak256, parseAbi, toBytes, type Address, type Hex } from "viem";
import {
  createAlpactoPublicClient,
  createSessionKernelClient,
  loadZeroDevConfigFromEnv,
  sendSponsoredCall,
} from "@alpacto/zero-dev";
import {
  extractClassificationDocument,
  extractScaleEvidence,
} from "../adapters/openai-vision.js";
import { downloadEvidenceBase64 } from "../lib/s3.js";
import { PROMPT_VERSION, config } from "../config.js";
import { runDeepSeekToolLoop } from "../adapters/deepseek.js";
import type OpenAI from "openai";

const alpactoAbi = parseAbi([
  "function submitAuditAttestation(uint256 lotId, uint32 version, bytes32 reportHash, uint8 result)",
]);

export type AuditJobData = {
  auditRunId: string;
  lotId: string;
  inspectionVersion: number;
};

type AuditContext = {
  lot: typeof lots.$inferSelect;
  inspection: typeof inspections.$inferSelect;
  order: typeof orders.$inferSelect;
  policy: typeof pricingPolicies.$inferSelect;
  categoryPrice: bigint;
  inspectorName: string;
  evidence: (typeof evidenceFiles.$inferSelect)[];
};

async function loadContext(
  db: Database,
  lotId: string,
  inspectionVersion: number,
): Promise<AuditContext> {
  const [lot] = await db.select().from(lots).where(eq(lots.id, lotId)).limit(1);
  if (!lot) throw new Error("Lot not found");

  const [inspection] = await db
    .select()
    .from(inspections)
    .where(
      and(eq(inspections.lotId, lotId), eq(inspections.version, inspectionVersion)),
    )
    .limit(1);
  if (!inspection) throw new Error("Inspection not found");

  const [order] = await db.select().from(orders).where(eq(orders.id, lot.orderId)).limit(1);
  if (!order) throw new Error("Order not found");

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, order.campaignId))
    .limit(1);
  if (!campaign) throw new Error("Campaign not found");

  const [policy] = await db
    .select()
    .from(pricingPolicies)
    .where(eq(pricingPolicies.id, campaign.pricingPolicyId))
    .limit(1);
  if (!policy) throw new Error("Pricing policy not found");

  const [category] = await db
    .select()
    .from(pricingCategories)
    .where(
      and(
        eq(pricingCategories.pricingPolicyId, policy.id),
        eq(pricingCategories.code, inspection.categoryCode),
      ),
    )
    .limit(1);
  if (!category) throw new Error("Category not found");

  const [inspector] = await db
    .select()
    .from(users)
    .where(eq(users.id, inspection.inspectorId))
    .limit(1);

  const evidence = await db
    .select()
    .from(evidenceFiles)
    .where(eq(evidenceFiles.inspectionId, inspection.id));

  return {
    lot,
    inspection,
    order,
    policy,
    categoryPrice: category.pricePenMinorPerKg,
    inspectorName: inspector?.name ?? "unknown",
    evidence,
  };
}

const TOOL_DEFINITIONS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_audit_context",
      description: "Load lot, inspection, pricing, inspector and evidence metadata",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "extract_scale_evidence",
      description: "OCR scale photo evidence",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "extract_classification_document",
      description: "OCR classification document evidence",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate_settlement",
      description: "Deterministic settlement preview for declared weight",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_audit_values",
      description: "Compare declared vs observed values",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "create_audit_report",
      description: "Persist audit report and findings",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "submit_audit_attestation",
      description: "Submit onchain attestation via ZeroDev session key",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
];

export async function processAuditJob(
  db: Database,
  data: AuditJobData,
  onLog: (msg: string) => void,
) {
  const ctx = await loadContext(db, data.lotId, data.inspectionVersion);
  let scaleReading: Awaited<ReturnType<typeof extractScaleEvidence>> | null = null;
  let classification: Awaited<ReturnType<typeof extractClassificationDocument>> | null =
    null;
  let compareResult: ReturnType<typeof compareAuditValues> | null = null;
  let settlement: ReturnType<typeof calculateSettlementPreview> | null = null;
  let reportHash: Hex | null = null;
  let onchainTxHash: string | null = null;

  await db
    .update(auditRuns)
    .set({ status: "running", startedAt: new Date(), provider: "deepseek" })
    .where(eq(auditRuns.id, data.auditRunId));

  const handlers: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {
    get_audit_context: async () => ({
      lotId: ctx.lot.id,
      onchainLotId: ctx.lot.onchainLotId?.toString() ?? null,
      inspectionVersion: ctx.inspection.version,
      declaredWeightGrams: ctx.inspection.weightGrams.toString(),
      categoryCode: ctx.inspection.categoryCode,
      inspector: ctx.inspectorName,
      evidenceCount: ctx.evidence.length,
    }),
    extract_scale_evidence: async () => {
      if (config.ayni.useFixtureVision) {
        const { scaleEvidenceSchema } = await import("@alpacto/shared-schemas");
        scaleReading = scaleEvidenceSchema.parse(
          JSON.parse(
            await import("node:fs").then((fs) =>
              fs.promises.readFile(
                new URL("../../fixtures/scale-reading.json", import.meta.url),
                "utf8",
              ),
            ),
          ),
        );
        onLog(`scale fixture: ${scaleReading.weightValueKg} kg`);
        return scaleReading;
      }
      const scaleFile = ctx.evidence.find((e) => e.type === "scale_photo");
      if (!scaleFile) {
        scaleReading = {
          readingDetected: false,
          weightValueKg: null,
          weightUnit: "kg",
          displayReadable: false,
          confidence: 0,
          warnings: ["no_scale_photo"],
        };
        return scaleReading;
      }
      const { base64, mimeType } = await downloadEvidenceBase64(scaleFile.storageKey);
      scaleReading = await extractScaleEvidence(base64, mimeType);
      onLog(`scale OCR: ${scaleReading.weightValueKg} kg`);
      return scaleReading;
    },
    extract_classification_document: async () => {
      if (config.ayni.useFixtureVision) {
        const { classificationDocSchema } = await import("@alpacto/shared-schemas");
        classification = classificationDocSchema.parse(
          JSON.parse(
            await import("node:fs").then((fs) =>
              fs.promises.readFile(
                new URL("../../fixtures/classification-doc.json", import.meta.url),
                "utf8",
              ),
            ),
          ),
        );
        return classification;
      }
      const docFile = ctx.evidence.find((e) => e.type === "classification_doc");
      if (!docFile) {
        classification = {
          documentReadable: false,
          lotReference: null,
          classification: null,
          inspectorName: null,
          inspectionDate: null,
          confidence: 0,
          missingFields: ["classification_doc"],
        };
        return classification;
      }
      const { base64, mimeType } = await downloadEvidenceBase64(docFile.storageKey);
      classification = await extractClassificationDocument(base64, mimeType);
      return classification;
    },
    calculate_settlement: async () => {
      const penPerUsdcMicros =
        ctx.policy.penPerUsdcMicros > 0n ? ctx.policy.penPerUsdcMicros : 3_750_000n;
      settlement = calculateSettlementPreview({
        weightGrams: ctx.inspection.weightGrams,
        pricePenMinorPerKg: ctx.categoryPrice,
        associationFeeBps: ctx.policy.associationFeeBps,
        penPerUsdcMicros,
      });
      return {
        grossPenMinor: settlement.grossPenMinor.toString(),
        netPenMinor: settlement.netPenMinor.toString(),
        producerUsdcUnits: settlement.producerUsdcUnits.toString(),
        associationUsdcUnits: settlement.associationUsdcUnits.toString(),
      };
    },
    compare_audit_values: async () => {
      compareResult = compareAuditValues({
        declaredWeightGrams: ctx.inspection.weightGrams,
        observedWeightKg: scaleReading?.weightValueKg ?? null,
        declaredCategory: ctx.inspection.categoryCode,
        observedCategory: classification?.classification,
        scaleReadable: scaleReading?.displayReadable ?? false,
        weightToleranceBps: ctx.policy.weightToleranceBps,
      });
      return compareResult;
    },
    create_audit_report: async () => {
      if (!compareResult) throw new Error("compare_audit_values must run first");
      const report = {
        lotId: ctx.lot.id,
        inspectionVersion: ctx.inspection.version,
        promptVersion: PROMPT_VERSION,
        scaleReading,
        classification,
        settlement: settlement
          ? {
              grossPenMinor: settlement.grossPenMinor.toString(),
              bonusPenMinor: settlement.bonusPenMinor.toString(),
              feePenMinor: settlement.feePenMinor.toString(),
              netPenMinor: settlement.netPenMinor.toString(),
              producerUsdcUnits: settlement.producerUsdcUnits.toString(),
              associationUsdcUnits: settlement.associationUsdcUnits.toString(),
            }
          : null,
        compareResult,
        createdAt: new Date().toISOString(),
      };
      const reportJson = JSON.stringify(report);
      reportHash = keccak256(toBytes(reportJson)) as Hex;
      const storageKey = `audits/${data.auditRunId}.json`;

      for (const finding of compareResult.findings) {
        await db.insert(auditFindings).values({
          auditRunId: data.auditRunId,
          code: finding.code,
          severity: finding.severity,
          declaredValue: finding.declaredValue,
          observedValue: finding.observedValue,
          explanation: finding.explanation,
        });
      }

      await db
        .update(auditRuns)
        .set({
          resultCode: compareResult.resultCode,
          reportHash,
          reportStorageKey: storageKey,
          modelAlias: config.deepseek.model,
          promptVersion: PROMPT_VERSION,
          completedAt: new Date(),
          status: "completed",
        })
        .where(eq(auditRuns.id, data.auditRunId));

      const lotStatus =
        compareResult.resultCode === "pass" || compareResult.resultCode === "warning"
          ? "ready_for_review"
          : "review_required";

      await db
        .update(lots)
        .set({ status: lotStatus, updatedAt: new Date() })
        .where(eq(lots.id, ctx.lot.id));

      return { reportHash, storageKey, resultCode: compareResult.resultCode };
    },
    submit_audit_attestation: async () => {
      if (!compareResult || !reportHash) {
        throw new Error("create_audit_report must run first");
      }
      if (!ctx.lot.onchainLotId || !config.chain.alpactoContract) {
        onLog("skip onchain attestation — no onchainLotId or contract");
        await db
          .update(auditRuns)
          .set({ status: "attested" })
          .where(eq(auditRuns.id, data.auditRunId));
        return { skipped: true, reason: "offchain_only" };
      }
      if (!config.ayni.sessionKey) {
        throw new Error("AYNI_SESSION_KEY missing");
      }

      const zd = loadZeroDevConfigFromEnv();
      const publicClient = createAlpactoPublicClient(zd);
      const sessionKey = config.ayni.sessionKey.startsWith("0x")
        ? (config.ayni.sessionKey as Hex)
        : (`0x${config.ayni.sessionKey}` as Hex);

      const serialized = process.env["AYNI_SERIALIZED_SESSION"];
      if (!serialized) {
        onLog("AYNI_SERIALIZED_SESSION missing — offchain attestation only");
        await db
          .update(auditRuns)
          .set({ status: "attested" })
          .where(eq(auditRuns.id, data.auditRunId));
        return { skipped: true, reason: "no_serialized_session" };
      }

      const client = await createSessionKernelClient({
        publicClient,
        config: zd,
        serializedSession: serialized,
        sessionPrivateKey: sessionKey,
      });

      const resultU8 = auditResultCodeToOnchain(
        compareResult.resultCode as AuditResultCode,
      );

      const { receipt } = await sendSponsoredCall({
        client,
        to: config.chain.alpactoContract as Address,
        abi: alpactoAbi,
        functionName: "submitAuditAttestation",
        args: [ctx.lot.onchainLotId, ctx.inspection.version, reportHash, resultU8],
      });

      onchainTxHash = receipt.receipt.transactionHash;
      await db
        .update(auditRuns)
        .set({ status: "attested", onchainTxHash })
        .where(eq(auditRuns.id, data.auditRunId));

      return { onchainTxHash };
    },
  };

  const systemPrompt = `You are Ayni, Alpacto's audit agent. Run the closed tool set in order:
1. get_audit_context
2. extract_scale_evidence
3. extract_classification_document
4. calculate_settlement
5. compare_audit_values
6. create_audit_report
7. submit_audit_attestation
Never calculate money yourself. Stop after attestation.`;

  onLog(`audit start run=${data.auditRunId}`);

  try {
    await runDeepSeekToolLoop({
      systemPrompt,
      userMessage: `Audit lot ${data.lotId} inspection v${data.inspectionVersion}`,
      tools: TOOL_DEFINITIONS,
      handlers,
    });
  } catch (err) {
    onLog(`DeepSeek loop failed, running deterministic fallback: ${err}`);
    await handlers.get_audit_context({});
    await handlers.extract_scale_evidence({});
    await handlers.extract_classification_document({});
    await handlers.calculate_settlement({});
    await handlers.compare_audit_values({});
    await handlers.create_audit_report({});
    await handlers.submit_audit_attestation({});
  }

  if (!compareResult) {
    await handlers.get_audit_context({});
    await handlers.extract_scale_evidence({});
    await handlers.extract_classification_document({});
    await handlers.calculate_settlement({});
    await handlers.compare_audit_values({});
    await handlers.create_audit_report({});
    await handlers.submit_audit_attestation({});
  }

  onLog(`audit complete result=${compareResult?.resultCode ?? "unknown"}`);
  return {
    auditRunId: data.auditRunId,
    resultCode: compareResult?.resultCode,
    reportHash,
    onchainTxHash,
  };
}

export async function markAuditFailed(
  db: Database,
  auditRunId: string,
  lotId: string,
  reason: string,
) {
  await db
    .update(auditRuns)
    .set({ status: "failed", completedAt: new Date() })
    .where(eq(auditRuns.id, auditRunId));
  await db
    .update(lots)
    .set({ status: "audit_failed", updatedAt: new Date() })
    .where(eq(lots.id, lotId));
  return reason;
}

export async function getLatestAuditForLot(db: Database, lotId: string) {
  const [run] = await db
    .select()
    .from(auditRuns)
    .where(eq(auditRuns.lotId, lotId))
    .orderBy(desc(auditRuns.inspectionVersion))
    .limit(1);
  return run ?? null;
}

export function hashSettlementQuote(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
