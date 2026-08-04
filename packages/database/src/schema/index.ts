import {
  bigint,
  boolean,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  role: varchar("role", { length: 32 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 32 }),
  email: varchar("email", { length: 255 }).notNull().unique(),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  smartAccountAddress: varchar("smart_account_address", { length: 42 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const passkeyCredentials = pgTable(
  "passkey_credentials",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    credentialId: text("credential_id").notNull().unique(),
    publicKey: text("public_key").notNull(),
    counter: bigint("counter", { mode: "bigint" }).notNull(),
    deviceType: varchar("device_type", { length: 32 }),
    backedUp: boolean("backed_up").notNull().default(false),
    transports: text("transports"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const ayniSessionKeys = pgTable("ayni_session_keys", {
  id: uuid("id").defaultRandom().primaryKey(),
  smartAccountAddress: varchar("smart_account_address", { length: 42 }).notNull(),
  sessionPublicAddress: varchar("session_public_address", { length: 42 }).notNull(),
  serializedSession: text("serialized_session"),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 64 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const organizationMembers = pgTable(
  "organization_members",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    memberRole: varchar("member_role", { length: 64 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.userId] })],
);

export const pricingPolicies = pgTable("pricing_policies", {
  id: uuid("id").defaultRandom().primaryKey(),
  version: integer("version").notNull().default(1),
  currency: varchar("currency", { length: 8 }).notNull().default("PEN"),
  associationFeeBps: integer("association_fee_bps").notNull(),
  weightToleranceBps: integer("weight_tolerance_bps").notNull(),
  penPerUsdcMicros: bigint("pen_per_usdc_micros", { mode: "bigint" }).notNull(),
  policyHash: varchar("policy_hash", { length: 66 }).notNull(),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pricingCategories = pgTable(
  "pricing_categories",
  {
    pricingPolicyId: uuid("pricing_policy_id")
      .notNull()
      .references(() => pricingPolicies.id),
    code: varchar("code", { length: 32 }).notNull(),
    label: varchar("label", { length: 128 }).notNull(),
    pricePenMinorPerKg: bigint("price_pen_minor_per_kg", { mode: "bigint" }).notNull(),
    qualityBonusPenMinorPerKg: bigint("quality_bonus_pen_minor_per_kg", {
      mode: "bigint",
    }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.pricingPolicyId, t.code] })],
);

export const campaigns = pgTable("campaigns", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  buyerId: uuid("buyer_id")
    .notNull()
    .references(() => users.id),
  name: varchar("name", { length: 255 }).notNull(),
  startDate: timestamp("start_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  pricingPolicyId: uuid("pricing_policy_id")
    .notNull()
    .references(() => pricingPolicies.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  externalRef: varchar("external_ref", { length: 64 }).unique(),
  onchainOrderId: bigint("onchain_order_id", { mode: "bigint" }),
  campaignId: uuid("campaign_id")
    .notNull()
    .references(() => campaigns.id),
  buyerId: uuid("buyer_id")
    .notNull()
    .references(() => users.id),
  associationId: uuid("association_id")
    .notNull()
    .references(() => organizations.id),
  budgetUsdCents: bigint("budget_usd_cents", { mode: "bigint" }).notNull(),
  fundedUsdcUnits: bigint("funded_usdc_units", { mode: "bigint" }).notNull(),
  remainingUsdcUnits: bigint("remaining_usdc_units", { mode: "bigint" }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("draft"),
  txHash: varchar("tx_hash", { length: 66 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const fundingIntents = pgTable(
  "funding_intents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    stripeSessionId: varchar("stripe_session_id", { length: 255 }),
    stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 255 }),
    stripeEventId: varchar("stripe_event_id", { length: 255 }),
    usdCents: bigint("usd_cents", { mode: "bigint" }).notNull(),
    usdcUnits: bigint("usdc_units", { mode: "bigint" }).notNull(),
    paymentReferenceHash: varchar("payment_reference_hash", { length: 66 }),
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    fundingTxHash: varchar("funding_tx_hash", { length: 66 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("funding_intents_stripe_session_id").on(t.stripeSessionId),
    unique("funding_intents_stripe_payment_intent_id").on(t.stripePaymentIntentId),
    unique("funding_intents_stripe_event_id").on(t.stripeEventId),
    unique("funding_intents_payment_reference_hash").on(t.paymentReferenceHash),
  ],
);

export const lots = pgTable("lots", {
  id: uuid("id").defaultRandom().primaryKey(),
  onchainLotId: bigint("onchain_lot_id", { mode: "bigint" }),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id),
  producerId: uuid("producer_id")
    .notNull()
    .references(() => users.id),
  status: varchar("status", { length: 32 }).notNull().default("registered"),
  currentInspectionVersion: integer("current_inspection_version").notNull().default(0),
  acceptedInspectionVersion: integer("accepted_inspection_version"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const inspections = pgTable(
  "inspections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    lotId: uuid("lot_id")
      .notNull()
      .references(() => lots.id),
    version: integer("version").notNull(),
    inspectorId: uuid("inspector_id")
      .notNull()
      .references(() => users.id),
    weightGrams: bigint("weight_grams", { mode: "bigint" }).notNull(),
    categoryCode: varchar("category_code", { length: 32 }).notNull(),
    evidenceBundleHash: varchar("evidence_bundle_hash", { length: 66 }),
    status: varchar("status", { length: 32 }).notNull().default("submitted"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    onchainTxHash: varchar("onchain_tx_hash", { length: 66 }),
  },
  (t) => [unique("inspections_lot_version").on(t.lotId, t.version)],
);

export const evidenceFiles = pgTable("evidence_files", {
  id: uuid("id").defaultRandom().primaryKey(),
  inspectionId: uuid("inspection_id").references(() => inspections.id),
  type: varchar("type", { length: 64 }).notNull(),
  storageKey: varchar("storage_key", { length: 512 }).notNull(),
  sha256: varchar("sha256", { length: 64 }).notNull(),
  mimeType: varchar("mime_type", { length: 128 }).notNull(),
  sizeBytes: bigint("size_bytes", { mode: "bigint" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditRuns = pgTable("audit_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  lotId: uuid("lot_id")
    .notNull()
    .references(() => lots.id),
  inspectionVersion: integer("inspection_version").notNull(),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  provider: varchar("provider", { length: 64 }),
  modelAlias: varchar("model_alias", { length: 128 }),
  promptVersion: varchar("prompt_version", { length: 64 }),
  resultCode: varchar("result_code", { length: 32 }),
  reportStorageKey: varchar("report_storage_key", { length: 512 }),
  reportHash: varchar("report_hash", { length: 66 }),
  onchainTxHash: varchar("onchain_tx_hash", { length: 66 }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const auditFindings = pgTable("audit_findings", {
  id: uuid("id").defaultRandom().primaryKey(),
  auditRunId: uuid("audit_run_id")
    .notNull()
    .references(() => auditRuns.id),
  code: varchar("code", { length: 64 }).notNull(),
  severity: varchar("severity", { length: 32 }).notNull(),
  declaredValue: text("declared_value"),
  observedValue: text("observed_value"),
  explanation: text("explanation"),
});

export const settlements = pgTable("settlements", {
  id: uuid("id").defaultRandom().primaryKey(),
  lotId: uuid("lot_id")
    .notNull()
    .references(() => lots.id),
  inspectionVersion: integer("inspection_version").notNull(),
  weightGrams: bigint("weight_grams", { mode: "bigint" }).notNull(),
  categoryCode: varchar("category_code", { length: 32 }).notNull(),
  grossPenMinor: bigint("gross_pen_minor", { mode: "bigint" }).notNull(),
  bonusPenMinor: bigint("bonus_pen_minor", { mode: "bigint" }).notNull(),
  feePenMinor: bigint("fee_pen_minor", { mode: "bigint" }).notNull(),
  netPenMinor: bigint("net_pen_minor", { mode: "bigint" }).notNull(),
  producerUsdcUnits: bigint("producer_usdc_units", { mode: "bigint" }).notNull(),
  associationUsdcUnits: bigint("association_usdc_units", { mode: "bigint" }).notNull(),
  quoteHash: varchar("quote_hash", { length: 66 }),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  settledAt: timestamp("settled_at", { withTimezone: true }),
  settlementTxHash: varchar("settlement_tx_hash", { length: 66 }),
});

export const reweighRequests = pgTable("reweigh_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  lotId: uuid("lot_id")
    .notNull()
    .references(() => lots.id),
  requestedBy: uuid("requested_by")
    .notNull()
    .references(() => users.id),
  reasonCode: varchar("reason_code", { length: 64 }).notNull(),
  reasonText: text("reason_text"),
  onchainTxHash: varchar("onchain_tx_hash", { length: 66 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const localPayouts = pgTable("local_payouts", {
  id: uuid("id").defaultRandom().primaryKey(),
  settlementId: uuid("settlement_id")
    .notNull()
    .references(() => settlements.id),
  provider: varchar("provider", { length: 64 }).notNull(),
  isSimulation: boolean("is_simulation").notNull().default(true),
  amountPenMinor: bigint("amount_pen_minor", { mode: "bigint" }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  reference: varchar("reference", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
