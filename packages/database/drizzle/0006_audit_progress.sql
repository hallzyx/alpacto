ALTER TABLE "audit_runs" ADD COLUMN IF NOT EXISTS "progress_phase" varchar(64) NOT NULL DEFAULT 'queued';
ALTER TABLE "audit_runs" ADD COLUMN IF NOT EXISTS "progress_label" varchar(255);
