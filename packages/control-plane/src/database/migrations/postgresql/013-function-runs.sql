ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "function_spec" jsonb;

CREATE TABLE IF NOT EXISTS "function_runs" (
    "id" text PRIMARY KEY NOT NULL,
    "service_id" text NOT NULL,
    "service_name" text NOT NULL,
    "manifest_name" text NOT NULL,
    "node_id" text NOT NULL,
    "status" text NOT NULL,
    "source" text NOT NULL,
    "exit_code" integer,
    "logs" text,
    "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "started_at" text,
    "completed_at" text,
    "duration_ms" integer,
    "error_message" text,
    "created_at" text NOT NULL
);
