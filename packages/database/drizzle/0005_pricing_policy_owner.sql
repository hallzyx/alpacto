-- Buyer ownership for pricing policies (null = platform/demo seed)
ALTER TABLE "pricing_policies" ADD COLUMN IF NOT EXISTS "created_by" uuid;
DO $$ BEGIN
  ALTER TABLE "pricing_policies"
    ADD CONSTRAINT "pricing_policies_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
