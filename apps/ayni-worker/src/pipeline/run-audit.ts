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
import { keccak256, parseAbi, toBytes, createWalletClient, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";
import {
  createAlpactoPublicClient,
  createPublicRpcTransport,
  loadZeroDevConfigFromEnv,
  trySessionSponsoredThenSelfFunded,
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
  "function grantRole(bytes32 role, address account)",
  "function auditorAgentRole() view returns (bytes32)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
]);

function normalizePrivateKey(key: string): Hex {
  const trimmed = key.trim();
  return (trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`) as Hex;
}

async function fundEthFromTreasury(to: Address): Promise<void> {
  const treasuryKey = process.env["TREASURY_PRIVATE_KEY"]?.trim();
  if (!treasuryKey) {
    throw new Error("TREASURY_PRIVATE_KEY required to top-up Ayni Kernel gas");
  }
  const publicClient = createAlpactoPublicClient({
    ...loadZeroDevConfigFromEnv(),
    publicRpc: config.chain.rpcUrl,
  });
  const bal = await publicClient.getBalance({ address: to });
  if (bal >= 10n ** 15n) return;

  const account = privateKeyToAccount(normalizePrivateKey(treasuryKey));
  const wallet = createWalletClient({
    account,
    chain: arbitrumSepolia,
    transport: http(config.chain.rpcUrl),
  });
  const hash = await wallet.sendTransaction({ to, value: 10n ** 16n });
  await publicClient.waitForTransactionReceipt({ hash });
}

async function ensureAyniAuditorRole(onLog: (msg: string) => void): Promise<void> {
  const ayniSa = config.ayni.smartAccount.trim();
  const core = config.chain.alpactoContract as Address;
  if (!ayniSa || !core) return;

  const treasuryKey = process.env["TREASURY_PRIVATE_KEY"]?.trim();
  if (!treasuryKey) return;

  const publicClient = createAlpactoPublicClient({
    ...loadZeroDevConfigFromEnv(),
    publicRpc: config.chain.rpcUrl,
  });
  const auditorRole = await publicClient.readContract({
    address: core,
    abi: alpactoAbi,
    functionName: "auditorAgentRole",
  });
  const hasRole = await publicClient.readContract({
    address: core,
    abi: alpactoAbi,
    functionName: "hasRole",
    args: [auditorRole, ayniSa as Address],
  });
  if (hasRole) return;

  onLog(`grant AUDITOR_AGENT_ROLE to Ayni SA ${ayniSa}`);
  const admin = privateKeyToAccount(normalizePrivateKey(treasuryKey));
  const wallet = createWalletClient({
    account: admin,
    chain: arbitrumSepolia,
    transport: createPublicRpcTransport(config.chain.rpcUrl),
  });
  const hash = await wallet.writeContract({
    address: core,
    abi: alpactoAbi,
    functionName: "grantRole",
    args: [auditorRole, ayniSa as Address],
  });
  await publicClient.waitForTransactionReceipt({ hash });
}

export type AuditJobData = {
  auditRunId: string;
  lotId: string;
  inspectionVersion: number;
};

const PHASE_LABELS: Record<string, string> = {
  queued: "En cola…",
  context: "Cargando contexto del lote…",
  scale: "Leyendo la foto de la balanza…",
  classification: "Revisando la clasificación…",
  settlement: "Calculando liquidación estimada…",
  compare: "Comparando declarado vs evidencia…",
  report: "Generando informe de auditoría…",
  attest: "Registrando el veredicto…",
  done: "Auditoría completa",
  failed: "Auditoría fallida",
};

/** Hide RPC URLs / API keys / viem dumps from producer/inspector-facing labels. */
export function sanitizeAuditFailureLabel(reason: string): string {
  const raw = reason.trim();
  if (/Requested resource not found|Unable to complete request|429|rate limit|ECONNRESET|ETIMEDOUT|fetch failed/i.test(raw)) {
    return "No se pudo registrar el veredicto ahora (la red falló un momento). El informe de Ayni sí está listo; reintenta en unos segundos.";
  }
  let s = raw
    .replace(/https?:\/\/[^\s)'"`]+/gi, "[RPC]")
    .replace(/Request body:[\s\S]{0,800}/gi, "")
    .replace(/Raw Call Arguments:[\s\S]{0,500}/gi, "")
    .replace(/Contract Call:[\s\S]{0,600}/gi, "")
    .replace(/Docs:[\s\S]{0,300}/gi, "")
    .replace(/Version: viem@[^\s]+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s || s.length < 8) {
    return "No se pudo completar el registro del veredicto. Reintenta en unos segundos.";
  }
  return s.slice(0, 255);
}

async function setProgress(
  db: Database,
  auditRunId: string,
  phase: string,
  label?: string,
) {
  await db
    .update(auditRuns)
    .set({
      progressPhase: phase,
      progressLabel: label ?? PHASE_LABELS[phase] ?? phase,
    })
    .where(eq(auditRuns.id, auditRunId));
}

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

  const [existingRun] = await db
    .select()
    .from(auditRuns)
    .where(eq(auditRuns.id, data.auditRunId))
    .limit(1);

  // BullMQ retries restart this function. If a prior attempt already wrote the
  // report, resume at attestation only — never rewind the live modal to "context".
  const canResumeAttest =
    Boolean(existingRun?.reportHash) &&
    Boolean(existingRun?.resultCode) &&
    existingRun?.status !== "attested" &&
    !existingRun?.onchainTxHash;

  if (canResumeAttest && existingRun?.reportHash && existingRun.resultCode) {
    reportHash = existingRun.reportHash as Hex;
    compareResult = {
      resultCode: existingRun.resultCode as AuditResultCode,
      findings: [],
      weightDeltaBps: null,
    };
    onLog(
      `resume audit run=${data.auditRunId} from attest (report already exists, skip OCR/compare)`,
    );
    await db
      .update(auditRuns)
      .set({
        status: "running",
        provider: "deepseek",
        progressPhase: "attest",
        progressLabel: PHASE_LABELS.attest,
      })
      .where(eq(auditRuns.id, data.auditRunId));
  } else {
    await db
      .update(auditRuns)
      .set({
        status: "running",
        startedAt: existingRun?.startedAt ?? new Date(),
        provider: "deepseek",
        progressPhase: "context",
        progressLabel: PHASE_LABELS.context,
      })
      .where(eq(auditRuns.id, data.auditRunId));
  }

  const handlers: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {
    get_audit_context: async () => {
      await setProgress(db, data.auditRunId, "context");
      return {
      lotId: ctx.lot.id,
      onchainLotId: ctx.lot.onchainLotId?.toString() ?? null,
      inspectionVersion: ctx.inspection.version,
      declaredWeightGrams: ctx.inspection.weightGrams.toString(),
      categoryCode: ctx.inspection.categoryCode,
      inspector: ctx.inspectorName,
      evidenceCount: ctx.evidence.length,
    };
    },
    extract_scale_evidence: async () => {
      await setProgress(db, data.auditRunId, "scale");
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
      await setProgress(db, data.auditRunId, "classification");
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
      await setProgress(db, data.auditRunId, "settlement");
      const penPerUsdcMicros =
        ctx.policy.penPerUsdcMicros > 0n ? ctx.policy.penPerUsdcMicros : 3_750_000n;
      settlement = calculateSettlementPreview({
        weightGrams: ctx.inspection.weightGrams,
        pricePenMinorPerKg: ctx.categoryPrice,
        associationFeeBps: ctx.policy.associationFeeBps,
        platformFeeBps: ctx.policy.platformFeeBps,
        penPerUsdcMicros,
      });
      return {
        grossPenMinor: settlement.grossPenMinor.toString(),
        netPenMinor: settlement.netPenMinor.toString(),
        producerUsdcUnits: settlement.producerUsdcUnits.toString(),
        associationUsdcUnits: settlement.associationUsdcUnits.toString(),
        platformUsdcUnits: settlement.platformUsdcUnits.toString(),
      };
    },
    compare_audit_values: async () => {
      await setProgress(db, data.auditRunId, "compare");
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
      await setProgress(db, data.auditRunId, "report");
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
              platformFeePenMinor: settlement.platformFeePenMinor.toString(),
              netPenMinor: settlement.netPenMinor.toString(),
              producerUsdcUnits: settlement.producerUsdcUnits.toString(),
              associationUsdcUnits: settlement.associationUsdcUnits.toString(),
              platformUsdcUnits: settlement.platformUsdcUnits.toString(),
            }
          : null,
        compareResult,
        createdAt: new Date().toISOString(),
      };
      const reportJson = JSON.stringify(report);
      reportHash = keccak256(toBytes(reportJson)) as Hex;
      const storageKey = `audits/${data.auditRunId}.json`;

      // Idempotent: DeepSeek / finishDeterministic may call this more than once.
      await db.delete(auditFindings).where(eq(auditFindings.auditRunId, data.auditRunId));

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
      await setProgress(db, data.auditRunId, "attest");
      if (!compareResult || !reportHash) {
        throw new Error("create_audit_report must run first");
      }
      if (!ctx.lot.onchainLotId || !config.chain.alpactoContract) {
        onLog("skip onchain attestation — no onchainLotId or contract");
        await db
          .update(auditRuns)
          .set({ status: "attested", progressPhase: "done", progressLabel: PHASE_LABELS.done })
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
          .set({ status: "attested", progressPhase: "done", progressLabel: PHASE_LABELS.done })
          .where(eq(auditRuns.id, data.auditRunId));
        return { skipped: true, reason: "no_serialized_session" };
      }

      const resultU8 = auditResultCodeToOnchain(
        compareResult.resultCode as AuditResultCode,
      );

      await ensureAyniAuditorRole(onLog);

      const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
      let lastErr: unknown;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const { receipt } = await trySessionSponsoredThenSelfFunded({
            publicClient,
            config: zd,
            serializedSession: serialized,
            sessionPrivateKey: sessionKey,
            fundEth: fundEthFromTreasury,
            to: config.chain.alpactoContract as Address,
            abi: alpactoAbi,
            functionName: "submitAuditAttestation",
            args: [ctx.lot.onchainLotId, ctx.inspection.version, reportHash, resultU8],
          });
          onchainTxHash = receipt.receipt.transactionHash;
          lastErr = undefined;
          break;
        } catch (err) {
          lastErr = err;
          const msg = err instanceof Error ? err.message : String(err);
          onLog(`attestation attempt ${attempt}/3 failed: ${msg.slice(0, 200)}`);
          if (attempt < 3) await sleep(800 * attempt);
        }
      }
      if (lastErr || !onchainTxHash) {
        throw lastErr instanceof Error
          ? lastErr
          : new Error(String(lastErr ?? "attestation failed"));
      }

      await db
        .update(auditRuns)
        .set({ status: "attested", onchainTxHash, progressPhase: "done", progressLabel: PHASE_LABELS.done })
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

  const finishDeterministic = async () => {
    if (!compareResult) {
      await handlers.get_audit_context({});
      await handlers.extract_scale_evidence({});
      await handlers.extract_classification_document({});
      await handlers.calculate_settlement({});
      await handlers.compare_audit_values({});
      await handlers.create_audit_report({});
    }
    if (!onchainTxHash && ctx.lot.onchainLotId && config.chain.alpactoContract) {
      await handlers.submit_audit_attestation({});
    }
  };

  if (canResumeAttest) {
    // Skip DeepSeek entirely on BullMQ retries after the report is already saved.
    await finishDeterministic();
  } else {
    try {
      await runDeepSeekToolLoop({
        systemPrompt,
        userMessage: `Audit lot ${data.lotId} inspection v${data.inspectionVersion}`,
        tools: TOOL_DEFINITIONS,
        handlers,
      });
    } catch (err) {
      onLog(`DeepSeek loop failed, finishing remaining steps: ${err}`);
      await finishDeterministic();
    }

    if (!compareResult || (!onchainTxHash && ctx.lot.onchainLotId && config.chain.alpactoContract)) {
      await finishDeterministic();
    }
  }

  if (!compareResult) {
    throw new Error("Audit pipeline did not produce a compare result");
  }

  // Report is done but attestation still missing → fail without claiming success,
  // so BullMQ can retry from attest (resume path above).
  if (!onchainTxHash && ctx.lot.onchainLotId && config.chain.alpactoContract) {
    throw new Error("Audit report ready but veredicto registration failed");
  }

  onLog(`audit complete result=${compareResult.resultCode}`);
  if (onchainTxHash) {
    await setProgress(db, data.auditRunId, "done", PHASE_LABELS.done);
  }
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
  const trimmed = sanitizeAuditFailureLabel(reason);
  const [existing] = await db
    .select()
    .from(auditRuns)
    .where(eq(auditRuns.id, auditRunId))
    .limit(1);

  // Keep a prior compare verdict (pass / review_required / …) if the pipeline
  // failed later (e.g. attestation). Only invent "failed" when nothing was decided.
  const resultCode = existing?.resultCode ?? "failed";

  await db
    .update(auditRuns)
    .set({
      status: "failed",
      completedAt: new Date(),
      progressPhase: "failed",
      progressLabel: trimmed.slice(0, 255),
      resultCode,
    })
    .where(eq(auditRuns.id, auditRunId));

  const priorFindings = await db
    .select({ id: auditFindings.id })
    .from(auditFindings)
    .where(eq(auditFindings.auditRunId, auditRunId))
    .limit(1);

  if (priorFindings.length === 0) {
    await db.insert(auditFindings).values({
      auditRunId,
      code: "PIPELINE_FAILED",
      severity: "critical",
      declaredValue: null,
      observedValue: null,
      explanation: trimmed,
    });
  }

  // If compare already set lot status (ready_for_review / review_required), keep it.
  if (!existing?.resultCode) {
    await db
      .update(lots)
      .set({ status: "audit_failed", updatedAt: new Date() })
      .where(eq(lots.id, lotId));
  }

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
