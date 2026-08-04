CREATE TABLE "audit_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_run_id" uuid NOT NULL,
	"code" varchar(64) NOT NULL,
	"severity" varchar(32) NOT NULL,
	"declared_value" text,
	"observed_value" text,
	"explanation" text
);
--> statement-breakpoint
CREATE TABLE "audit_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lot_id" uuid NOT NULL,
	"inspection_version" integer NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"provider" varchar(64),
	"model_alias" varchar(128),
	"prompt_version" varchar(64),
	"result_code" varchar(32),
	"report_storage_key" varchar(512),
	"report_hash" varchar(66),
	"onchain_tx_hash" varchar(66),
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"pricing_policy_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inspection_id" uuid,
	"type" varchar(64) NOT NULL,
	"storage_key" varchar(512) NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"mime_type" varchar(128) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funding_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"stripe_session_id" varchar(255),
	"stripe_payment_intent_id" varchar(255),
	"stripe_event_id" varchar(255),
	"usd_cents" bigint NOT NULL,
	"usdc_units" bigint NOT NULL,
	"payment_reference_hash" varchar(66),
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"funding_tx_hash" varchar(66),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "funding_intents_stripe_session_id" UNIQUE("stripe_session_id"),
	CONSTRAINT "funding_intents_stripe_payment_intent_id" UNIQUE("stripe_payment_intent_id"),
	CONSTRAINT "funding_intents_stripe_event_id" UNIQUE("stripe_event_id"),
	CONSTRAINT "funding_intents_payment_reference_hash" UNIQUE("payment_reference_hash")
);
--> statement-breakpoint
CREATE TABLE "inspections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lot_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"inspector_id" uuid NOT NULL,
	"weight_grams" bigint NOT NULL,
	"category_code" varchar(32) NOT NULL,
	"evidence_bundle_hash" varchar(66),
	"status" varchar(32) DEFAULT 'submitted' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"onchain_tx_hash" varchar(66),
	CONSTRAINT "inspections_lot_version" UNIQUE("lot_id","version")
);
--> statement-breakpoint
CREATE TABLE "local_payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"settlement_id" uuid NOT NULL,
	"provider" varchar(64) NOT NULL,
	"is_simulation" boolean DEFAULT true NOT NULL,
	"amount_pen_minor" bigint NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"reference" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"onchain_lot_id" bigint,
	"order_id" uuid NOT NULL,
	"producer_id" uuid NOT NULL,
	"status" varchar(32) DEFAULT 'registered' NOT NULL,
	"current_inspection_version" integer DEFAULT 0 NOT NULL,
	"accepted_inspection_version" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_ref" varchar(64),
	"onchain_order_id" bigint,
	"campaign_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"association_id" uuid NOT NULL,
	"budget_usd_cents" bigint NOT NULL,
	"funded_usdc_units" bigint NOT NULL,
	"remaining_usdc_units" bigint NOT NULL,
	"status" varchar(32) DEFAULT 'draft' NOT NULL,
	"tx_hash" varchar(66),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_external_ref_unique" UNIQUE("external_ref")
);
--> statement-breakpoint
CREATE TABLE "organization_members" (
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"member_role" varchar(64) NOT NULL,
	CONSTRAINT "organization_members_organization_id_user_id_pk" PRIMARY KEY("organization_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" varchar(64) NOT NULL,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pricing_categories" (
	"pricing_policy_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL,
	"label" varchar(128) NOT NULL,
	"price_pen_minor_per_kg" bigint NOT NULL,
	"quality_bonus_pen_minor_per_kg" bigint NOT NULL,
	CONSTRAINT "pricing_categories_pricing_policy_id_code_pk" PRIMARY KEY("pricing_policy_id","code")
);
--> statement-breakpoint
CREATE TABLE "pricing_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"currency" varchar(8) DEFAULT 'PEN' NOT NULL,
	"association_fee_bps" integer NOT NULL,
	"weight_tolerance_bps" integer NOT NULL,
	"pen_per_usdc_micros" bigint NOT NULL,
	"policy_hash" varchar(66) NOT NULL,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reweigh_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lot_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"reason_code" varchar(64) NOT NULL,
	"reason_text" text,
	"onchain_tx_hash" varchar(66),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lot_id" uuid NOT NULL,
	"inspection_version" integer NOT NULL,
	"weight_grams" bigint NOT NULL,
	"category_code" varchar(32) NOT NULL,
	"gross_pen_minor" bigint NOT NULL,
	"bonus_pen_minor" bigint NOT NULL,
	"fee_pen_minor" bigint NOT NULL,
	"net_pen_minor" bigint NOT NULL,
	"producer_usdc_units" bigint NOT NULL,
	"association_usdc_units" bigint NOT NULL,
	"quote_hash" varchar(66),
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"accepted_at" timestamp with time zone,
	"settled_at" timestamp with time zone,
	"settlement_tx_hash" varchar(66)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role" varchar(32) NOT NULL,
	"name" varchar(255) NOT NULL,
	"phone" varchar(32),
	"email" varchar(255) NOT NULL,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"smart_account_address" varchar(42),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "audit_findings" ADD CONSTRAINT "audit_findings_audit_run_id_audit_runs_id_fk" FOREIGN KEY ("audit_run_id") REFERENCES "public"."audit_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_runs" ADD CONSTRAINT "audit_runs_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_pricing_policy_id_pricing_policies_id_fk" FOREIGN KEY ("pricing_policy_id") REFERENCES "public"."pricing_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_files" ADD CONSTRAINT "evidence_files_inspection_id_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funding_intents" ADD CONSTRAINT "funding_intents_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_inspector_id_users_id_fk" FOREIGN KEY ("inspector_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_payouts" ADD CONSTRAINT "local_payouts_settlement_id_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."settlements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_producer_id_users_id_fk" FOREIGN KEY ("producer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_association_id_organizations_id_fk" FOREIGN KEY ("association_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_categories" ADD CONSTRAINT "pricing_categories_pricing_policy_id_pricing_policies_id_fk" FOREIGN KEY ("pricing_policy_id") REFERENCES "public"."pricing_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reweigh_requests" ADD CONSTRAINT "reweigh_requests_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reweigh_requests" ADD CONSTRAINT "reweigh_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE no action ON UPDATE no action;