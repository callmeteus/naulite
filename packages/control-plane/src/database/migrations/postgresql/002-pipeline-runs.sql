CREATE TABLE IF NOT EXISTS "pipeline_runs" (
  "id" text PRIMARY KEY NOT NULL,
  "kind" text NOT NULL,
  "status" text NOT NULL,
  "manifest_name" text,
  "service_name" text,
  "image_ref" text,
  "commit_sha" text,
  "branch" text,
  "workflow_id" text,
  "pool" text,
  "node_id" text,
  "node_hostname" text,
  "started_at" text,
  "completed_at" text,
  "error_message" text,
  "failure_log" text,
  "created_at" text NOT NULL
);

CREATE TABLE IF NOT EXISTS "pipeline_steps" (
  "id" text PRIMARY KEY NOT NULL,
  "run_id" text NOT NULL,
  "name" text NOT NULL,
  "order" integer NOT NULL,
  "status" text NOT NULL,
  "node_id" text,
  "pool" text,
  "started_at" text,
  "completed_at" text,
  "exit_code" integer,
  "log_text" text
);

CREATE TABLE IF NOT EXISTS "pipeline_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "run_id" text NOT NULL,
  "step_id" text,
  "kind" text NOT NULL,
  "level" text NOT NULL DEFAULT 'info',
  "message" text NOT NULL,
  "emoji" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" text NOT NULL
);

CREATE INDEX IF NOT EXISTS "pipeline_runs_kind_created_idx" ON "pipeline_runs" ("kind", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "pipeline_runs_service_idx" ON "pipeline_runs" ("service_name");
CREATE INDEX IF NOT EXISTS "pipeline_events_run_id_idx" ON "pipeline_events" ("run_id", "id");
