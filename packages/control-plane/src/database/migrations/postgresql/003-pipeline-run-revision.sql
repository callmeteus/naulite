ALTER TABLE "pipeline_runs" ADD COLUMN IF NOT EXISTS "revision_id" text;

CREATE INDEX IF NOT EXISTS "pipeline_runs_revision_idx" ON "pipeline_runs" ("revision_id");
