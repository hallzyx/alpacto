-- Platform fee (0.5% = 50 bps) on pricing policies + settlement split
ALTER TABLE "pricing_policies" ADD COLUMN IF NOT EXISTS "platform_fee_bps" integer NOT NULL DEFAULT 50;
ALTER TABLE "settlements" ADD COLUMN IF NOT EXISTS "platform_fee_pen_minor" bigint NOT NULL DEFAULT 0;
ALTER TABLE "settlements" ADD COLUMN IF NOT EXISTS "platform_usdc_units" bigint NOT NULL DEFAULT 0;

UPDATE "pricing_policies" SET "platform_fee_bps" = 50 WHERE "platform_fee_bps" IS NULL OR "platform_fee_bps" = 0;
