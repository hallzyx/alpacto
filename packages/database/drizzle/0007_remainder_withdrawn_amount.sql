ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "remainder_withdraw_tx_hash" varchar(66);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "remainder_withdrawn_usdc_units" bigint;
ALTER TABLE "lots" ADD COLUMN IF NOT EXISTS "register_tx_hash" varchar(66);

CREATE TABLE IF NOT EXISTS "producer_session_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "smart_account_address" varchar(42) NOT NULL,
  "session_public_address" varchar(42) NOT NULL,
  "session_private_key" varchar(66),
  "serialized_session" text,
  "status" varchar(32) DEFAULT 'pending' NOT NULL,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
