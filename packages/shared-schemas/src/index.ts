import { z } from "zod";

export const demoLoginSchema = z.object({
  email: z.string().email(),
});

/** Accepts ISO datetime or YYYY-MM-DD from HTML date inputs. */
const optionalCalendarDate = z
  .string()
  .min(1)
  .refine(
    (v) => !Number.isNaN(Date.parse(v.includes("T") ? v : `${v}T00:00:00.000Z`)),
    "Invalid date",
  )
  .optional();

export const createCampaignSchema = z.object({
  organizationId: z.string().uuid(),
  /** Defaults to the authenticated buyer when omitted. */
  buyerId: z.string().uuid().optional(),
  name: z.string().min(1).max(255),
  pricingPolicyId: z.string().uuid(),
  startDate: optionalCalendarDate,
  endDate: optionalCalendarDate,
});

export const createOrderSchema = z
  .object({
    campaignId: z.string().uuid(),
    externalRef: z.string().min(1).max(64).optional(),
    associationId: z.string().uuid().optional(),
    /** Preferred: meta de acopio en gramos; el API calcula budget con la política. */
    targetWeightGrams: z.coerce.bigint().positive().optional(),
    /** Legacy / override; si viene targetWeightGrams, el servidor recalcula. */
    budgetUsdCents: z.coerce.bigint().positive().optional(),
  })
  .refine((v) => v.targetWeightGrams != null || v.budgetUsdCents != null, {
    message: "Provide targetWeightGrams or budgetUsdCents",
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

export const declineLotSchema = z.object({
  reasonCode: z.enum([
    "wrong_weight",
    "wrong_producer",
    "not_my_fiber",
    "wrong_order",
    "other",
  ]),
  reasonText: z.string().max(2000).optional(),
});

export const resolveLotDisputeSchema = z.object({
  action: z.enum([
    "correct_and_resubmit",
    "reassign_producer",
    "delete_lot",
    "acknowledge",
    "investigating",
  ]),
  producerId: z.string().uuid().optional(),
  resolutionNote: z.string().max(2000).optional(),
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
export type DeclineLotInput = z.infer<typeof declineLotSchema>;
export type ResolveLotDisputeInput = z.infer<typeof resolveLotDisputeSchema>;
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

export const producerSessionSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(255),
  smartAccountAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  authMethod: z.enum(["google", "email_otp", "passkey"]),
});

export type ProducerSessionInput = z.infer<typeof producerSessionSchema>;

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

export const ayniGuideChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(4000),
});

export const ayniGuideChatSchema = z.object({
  messages: z.array(ayniGuideChatMessageSchema).min(1).max(40),
});

export const ayniProducerChatSchema = z.object({
  messages: z.array(ayniGuideChatMessageSchema).min(1).max(40),
  contextLotId: z.string().uuid().optional(),
  contextPath: z.string().max(256).optional(),
});

export const openIntegrityDisputeSchema = z.object({
  note: z.string().max(2000).optional(),
  diffs: z
    .array(
      z.object({
        field: z.string(),
        postgres: z.string(),
        onchain: z.string(),
      }),
    )
    .max(20)
    .optional(),
});

export type ScaleEvidence = z.infer<typeof scaleEvidenceSchema>;
export type ClassificationDoc = z.infer<typeof classificationDocSchema>;
export type CompareResult = z.infer<typeof compareResultSchema>;
export type AuditResultCode = z.infer<typeof auditResultCodeSchema>;
export type CreateAuditInput = z.infer<typeof createAuditSchema>;
export type AyniGuideChatInput = z.infer<typeof ayniGuideChatSchema>;
export type AyniGuideChatMessage = z.infer<typeof ayniGuideChatMessageSchema>;
export type AyniProducerChatInput = z.infer<typeof ayniProducerChatSchema>;
export type OpenIntegrityDisputeInput = z.infer<typeof openIntegrityDisputeSchema>;
