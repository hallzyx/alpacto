-- Producer confirmation gate + association dispute inbox
ALTER TABLE "lots" ADD COLUMN IF NOT EXISTS "producer_confirmed_at" timestamp with time zone;
ALTER TABLE "lots" ADD COLUMN IF NOT EXISTS "producer_declined_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS "lot_disputes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "lot_id" uuid NOT NULL REFERENCES "lots"("id"),
  "opened_by" uuid NOT NULL REFERENCES "users"("id"),
  "reason_code" varchar(64) NOT NULL,
  "reason_text" text,
  "status" varchar(32) DEFAULT 'open' NOT NULL,
  "resolution_action" varchar(64),
  "resolution_note" text,
  "resolved_by" uuid REFERENCES "users"("id"),
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "lot_disputes_status_idx" ON "lot_disputes" ("status");
CREATE INDEX IF NOT EXISTS "lot_disputes_lot_id_idx" ON "lot_disputes" ("lot_id");
