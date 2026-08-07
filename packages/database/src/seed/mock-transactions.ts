import { createHash } from "node:crypto";
import type { Database } from "../index.js";
import {
  auditFindings,
  auditRuns,
  campaigns,
  evidenceFiles,
  inspections,
  lotDisputes,
  lots,
  orders,
  reweighRequests,
  settlements,
} from "../schema/index.js";
import type { FoundationContext } from "./foundation.js";

function fakeSha256(seed: string): string {
  return createHash("sha256").update(seed).digest("hex");
}

function fakeHex66(seed: string): string {
  return `0x${fakeSha256(seed).slice(0, 64)}`;
}

/**
 * Insert demo campaigns, orders, lots and related rows for role dashboards.
 * Caller must ensure transactional tables are empty (or reset) first.
 */
export async function seedMockTransactions(
  db: Database,
  ctx: FoundationContext,
): Promise<{
  campaignIds: string[];
  orderRefs: string[];
  lotCount: number;
}> {
  console.log("📦 Seeding mock transactions…");

  const martina = ctx.byEmail["martina@demo.alpacto"]!;
  const carlos = ctx.byEmail["carlos@demo.alpacto"]!;
  const andes = ctx.byEmail["andes@demo.alpacto"]!;
  const { associationOrg, policy } = ctx;

  const [campaignDemo] = await db
    .insert(campaigns)
    .values({
      organizationId: associationOrg.id,
      buyerId: andes.id,
      name: "Campaña Demo 2026",
      status: "active",
      pricingPolicyId: policy.id,
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
    })
    .returning();

  const [campaignQ3] = await db
    .insert(campaigns)
    .values({
      organizationId: associationOrg.id,
      buyerId: andes.id,
      name: "Campaña Altiplano Q3",
      status: "active",
      pricingPolicyId: policy.id,
      startDate: new Date("2026-07-01"),
      endDate: new Date("2026-09-30"),
    })
    .returning();

  const fundedUsdc = 1_000_000_000n; // $1000 USDC (6 decimals)
  const budgetUsdCents = 100_000n;

  const [orderMain] = await db
    .insert(orders)
    .values({
      externalRef: "ALP-2026-001",
      campaignId: campaignDemo!.id,
      buyerId: andes.id,
      associationId: associationOrg.id,
      budgetUsdCents,
      targetWeightGrams: 500_000n,
      fundedUsdcUnits: fundedUsdc,
      remainingUsdcUnits: fundedUsdc,
      status: "accepting_lots",
    })
    .returning();

  const [orderDraft] = await db
    .insert(orders)
    .values({
      externalRef: "ALP-2026-002",
      campaignId: campaignQ3!.id,
      buyerId: andes.id,
      associationId: associationOrg.id,
      budgetUsdCents: 50_000n,
      targetWeightGrams: 200_000n,
      fundedUsdcUnits: 0n,
      remainingUsdcUnits: 0n,
      status: "draft",
    })
    .returning();

  const partialFunded = 500_000_000n;
  const partialRemaining = 320_000_000n;
  const [orderPartial] = await db
    .insert(orders)
    .values({
      externalRef: "ALP-2026-003",
      campaignId: campaignDemo!.id,
      buyerId: andes.id,
      associationId: associationOrg.id,
      budgetUsdCents: 50_000n,
      targetWeightGrams: 250_000n,
      fundedUsdcUnits: partialFunded,
      remainingUsdcUnits: partialRemaining,
      status: "partially_settled",
      txHash: fakeHex66("order-partial-tx"),
    })
    .returning();

  const now = new Date();
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

  // ── Lot A: awaiting producer confirmation ─────────────────────────
  const [lotA] = await db
    .insert(lots)
    .values({
      orderId: orderMain!.id,
      producerId: martina.id,
      status: "awaiting_producer_confirmation",
      currentInspectionVersion: 0,
      createdAt: daysAgo(1),
      updatedAt: daysAgo(1),
    })
    .returning();

  // ── Lot B: registered (ready for inspector) ───────────────────────
  const [lotB] = await db
    .insert(lots)
    .values({
      orderId: orderMain!.id,
      producerId: martina.id,
      status: "registered",
      currentInspectionVersion: 0,
      producerConfirmedAt: daysAgo(2),
      createdAt: daysAgo(3),
      updatedAt: daysAgo(2),
    })
    .returning();

  // ── Lot C: ready_for_review (inspection + audit pass) ─────────────
  const [lotC] = await db
    .insert(lots)
    .values({
      orderId: orderMain!.id,
      producerId: martina.id,
      status: "ready_for_review",
      currentInspectionVersion: 1,
      producerConfirmedAt: daysAgo(5),
      createdAt: daysAgo(6),
      updatedAt: daysAgo(4),
    })
    .returning();

  const weightC = 42_500n;
  const [inspC] = await db
    .insert(inspections)
    .values({
      lotId: lotC!.id,
      version: 1,
      inspectorId: carlos.id,
      weightGrams: weightC,
      categoryCode: "FINE",
      evidenceBundleHash: fakeHex66("insp-c-evidence"),
      status: "submitted",
      submittedAt: daysAgo(4),
    })
    .returning();

  await db.insert(evidenceFiles).values({
    inspectionId: inspC!.id,
    type: "scale_photo",
    storageKey: `mock/lots/${lotC!.id}/v1/scale.jpg`,
    sha256: fakeSha256("scale-c"),
    mimeType: "image/jpeg",
    sizeBytes: 245_760n,
  });

  const [auditC] = await db
    .insert(auditRuns)
    .values({
      lotId: lotC!.id,
      inspectionVersion: 1,
      status: "completed",
      progressPhase: "done",
      progressLabel: "Auditoría completada",
      provider: "mock",
      modelAlias: "demo-ayni",
      promptVersion: "seed-v1",
      resultCode: "pass",
      reportStorageKey: `mock/lots/${lotC!.id}/v1/ayni-report.json`,
      reportHash: fakeHex66("audit-c-report"),
      startedAt: daysAgo(4),
      completedAt: daysAgo(4),
    })
    .returning();

  await db.insert(auditFindings).values({
    auditRunId: auditC!.id,
    code: "weight_match",
    severity: "info",
    declaredValue: "42.5",
    observedValue: "42.5",
    explanation: "Peso de báscula coincide con lo declarado (± tolerancia).",
  });

  // ── Lot D: reweighing_requested ───────────────────────────────────
  const [lotD] = await db
    .insert(lots)
    .values({
      orderId: orderMain!.id,
      producerId: martina.id,
      status: "reweighing_requested",
      currentInspectionVersion: 1,
      producerConfirmedAt: daysAgo(8),
      createdAt: daysAgo(9),
      updatedAt: daysAgo(3),
    })
    .returning();

  const [inspD] = await db
    .insert(inspections)
    .values({
      lotId: lotD!.id,
      version: 1,
      inspectorId: carlos.id,
      weightGrams: 38_200n,
      categoryCode: "MEDIUM",
      evidenceBundleHash: fakeHex66("insp-d-evidence"),
      status: "submitted",
      submittedAt: daysAgo(5),
    })
    .returning();

  await db.insert(evidenceFiles).values({
    inspectionId: inspD!.id,
    type: "scale_photo",
    storageKey: `mock/lots/${lotD!.id}/v1/scale.jpg`,
    sha256: fakeSha256("scale-d"),
    mimeType: "image/jpeg",
    sizeBytes: 198_400n,
  });

  await db.insert(reweighRequests).values({
    lotId: lotD!.id,
    requestedBy: martina.id,
    reasonCode: "weight_dispute",
    reasonText: "El peso en la foto no coincide con lo que vi en acopio.",
    createdAt: daysAgo(3),
  });

  // ── Lot E: producer_declined + open dispute ───────────────────────
  const [lotE] = await db
    .insert(lots)
    .values({
      orderId: orderMain!.id,
      producerId: martina.id,
      status: "producer_declined",
      currentInspectionVersion: 0,
      producerDeclinedAt: daysAgo(2),
      createdAt: daysAgo(4),
      updatedAt: daysAgo(2),
    })
    .returning();

  await db.insert(lotDisputes).values({
    lotId: lotE!.id,
    openedBy: martina.id,
    reasonCode: "wrong_producer",
    reasonText: "Este lote no es mío; pertenece a otra productora del anexo.",
    status: "open",
    createdAt: daysAgo(2),
  });

  // ── Lot F: settlement_accepted ────────────────────────────────────
  const [lotF] = await db
    .insert(lots)
    .values({
      orderId: orderMain!.id,
      producerId: martina.id,
      status: "settlement_accepted",
      currentInspectionVersion: 1,
      acceptedInspectionVersion: 1,
      producerConfirmedAt: daysAgo(12),
      createdAt: daysAgo(14),
      updatedAt: daysAgo(7),
    })
    .returning();

  const weightF = 51_000n;
  const [inspF] = await db
    .insert(inspections)
    .values({
      lotId: lotF!.id,
      version: 1,
      inspectorId: carlos.id,
      weightGrams: weightF,
      categoryCode: "FINE",
      evidenceBundleHash: fakeHex66("insp-f-evidence"),
      status: "submitted",
      submittedAt: daysAgo(10),
    })
    .returning();

  await db.insert(evidenceFiles).values({
    inspectionId: inspF!.id,
    type: "scale_photo",
    storageKey: `mock/lots/${lotF!.id}/v1/scale.jpg`,
    sha256: fakeSha256("scale-f"),
    mimeType: "image/jpeg",
    sizeBytes: 221_184n,
  });

  const [auditF] = await db
    .insert(auditRuns)
    .values({
      lotId: lotF!.id,
      inspectionVersion: 1,
      status: "completed",
      progressPhase: "done",
      progressLabel: "Auditoría completada",
      provider: "mock",
      modelAlias: "demo-ayni",
      promptVersion: "seed-v1",
      resultCode: "pass",
      reportHash: fakeHex66("audit-f-report"),
      startedAt: daysAgo(10),
      completedAt: daysAgo(10),
    })
    .returning();

  await db.insert(auditFindings).values({
    auditRunId: auditF!.id,
    code: "weight_match",
    severity: "info",
    declaredValue: "51.0",
    observedValue: "51.0",
    explanation: "Consistencia OK para liquidación demo.",
  });

  // FINE @ 27.50 PEN/kg × 51 kg = 1402.50 PEN → 140250 minor
  // fees: assoc 3% = 4207.5 → 4208, platform 0.5% = 701
  const grossPen = 140_250n;
  const feePen = 4_208n;
  const platformFeePen = 701n;
  const netPen = grossPen - feePen - platformFeePen;
  // ~$374 USDC at demo FX (3.75 PEN/USDC) → micros: netPen/375 * 1e6 roughly
  // Use round demo splits in USDC 6-decimals
  const producerUsdc = 366_000_000n;
  const associationUsdc = 11_000_000n;
  const platformUsdc = 1_800_000n;

  await db.insert(settlements).values({
    lotId: lotF!.id,
    inspectionVersion: 1,
    weightGrams: weightF,
    categoryCode: "FINE",
    grossPenMinor: grossPen,
    bonusPenMinor: 0n,
    feePenMinor: feePen,
    platformFeePenMinor: platformFeePen,
    netPenMinor: netPen,
    producerUsdcUnits: producerUsdc,
    associationUsdcUnits: associationUsdc,
    platformUsdcUnits: platformUsdc,
    quoteHash: fakeHex66("settlement-f-quote"),
    status: "accepted",
    acceptedAt: daysAgo(7),
  });

  // Silence unused var warnings for lots that only establish status
  void lotA;
  void lotB;
  void orderDraft;
  void orderPartial;

  const lotCount = 6;
  console.log("  campaigns: Campaña Demo 2026, Campaña Altiplano Q3");
  console.log("  orders: ALP-2026-001, ALP-2026-002, ALP-2026-003");
  console.log(`  lots: ${lotCount} (awaiting → registered → review → reweigh → declined → accepted)`);

  return {
    campaignIds: [campaignDemo!.id, campaignQ3!.id],
    orderRefs: ["ALP-2026-001", "ALP-2026-002", "ALP-2026-003"],
    lotCount,
  };
}
