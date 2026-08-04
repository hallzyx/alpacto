import { z } from "zod";

export const demoLoginSchema = z.object({
  email: z.string().email(),
});

export const createCampaignSchema = z.object({
  organizationId: z.string().uuid(),
  buyerId: z.string().uuid(),
  name: z.string().min(1).max(255),
  pricingPolicyId: z.string().uuid(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export const createOrderSchema = z.object({
  campaignId: z.string().uuid(),
  externalRef: z.string().min(1).max(64).optional(),
  budgetUsdCents: z.coerce.bigint().positive(),
  associationId: z.string().uuid().optional(),
});

export const createLotSchema = z.object({
  orderId: z.string().uuid(),
  producerId: z.string().uuid(),
  onchainLotId: z.coerce.bigint().optional(),
});

export const createInspectionSchema = z.object({
  weightGrams: z.coerce.bigint().positive(),
  categoryCode: z.string().min(1).max(32),
  evidenceBundleHash: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/)
    .optional(),
  evidenceFileIds: z.array(z.string().uuid()).optional(),
});

export const reweighRequestSchema = z.object({
  reasonCode: z.string().min(1).max(64),
  reasonText: z.string().max(2000).optional(),
});

const allowedMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export const evidenceUploadUrlSchema = z.object({
  type: z.enum(["scale_photo", "classification_doc", "other"]),
  mimeType: z.enum(allowedMimeTypes),
  sizeBytes: z.coerce.bigint().positive().max(10_485_760n), // 10 MiB
  inspectionId: z.string().uuid().optional(),
});

export type DemoLoginInput = z.infer<typeof demoLoginSchema>;
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type CreateLotInput = z.infer<typeof createLotSchema>;
export type CreateInspectionInput = z.infer<typeof createInspectionSchema>;
export type ReweighRequestInput = z.infer<typeof reweighRequestSchema>;
export const fundingIntentStatusSchema = z.enum([
  "pending",
  "paid",
  "funding",
  "funded",
  "failed",
]);

export const fundingSessionResponseSchema = z.object({
  fundingIntentId: z.string().uuid(),
  sessionId: z.string(),
  url: z.string().url().nullable(),
  usdCents: z.string(),
  usdcUnits: z.string(),
});

export type FundingIntentStatus = z.infer<typeof fundingIntentStatusSchema>;
export type FundingSessionResponse = z.infer<typeof fundingSessionResponseSchema>;

export const auditResultCodeSchema = z.enum([
  "pass",
  "warning",
  "review_required",
  "unreadable",
]);

export const scaleEvidenceSchema = z.object({
  readingDetected: z.boolean(),
  weightValueKg: z.number().nullable(),
  weightUnit: z.enum(["kg", "g", "lb"]).default("kg"),
  displayReadable: z.boolean(),
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string()).default([]),
});

export const classificationDocSchema = z.object({
  documentReadable: z.boolean(),
  lotReference: z.string().nullable(),
  classification: z.string().nullable(),
  inspectorName: z.string().nullable(),
  inspectionDate: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  missingFields: z.array(z.string()).default([]),
});

export const auditFindingSchema = z.object({
  code: z.string(),
  severity: z.enum(["info", "warning", "critical"]),
  declaredValue: z.string(),
  observedValue: z.string(),
  explanation: z.string(),
});

export const compareResultSchema = z.object({
  resultCode: auditResultCodeSchema,
  findings: z.array(auditFindingSchema),
  weightDeltaBps: z.number().nullable(),
});

export const createAuditSchema = z.object({
  inspectionVersion: z.coerce.number().int().positive().optional(),
});

export type ScaleEvidence = z.infer<typeof scaleEvidenceSchema>;
export type ClassificationDoc = z.infer<typeof classificationDocSchema>;
export type CompareResult = z.infer<typeof compareResultSchema>;
export type AuditResultCode = z.infer<typeof auditResultCodeSchema>;
export type CreateAuditInput = z.infer<typeof createAuditSchema>;
