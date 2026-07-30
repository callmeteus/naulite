ALTER TABLE "nodes" ADD COLUMN IF NOT EXISTS "os_family" text;
ALTER TABLE "nodes" ADD COLUMN IF NOT EXISTS "os_version" text;
ALTER TABLE "nodes" ADD COLUMN IF NOT EXISTS "arch" text;

CREATE TABLE IF NOT EXISTS "host_inventories" (
  "node_id" text PRIMARY KEY NOT NULL,
  "package_manager" text NOT NULL,
  "packages" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "collected_at" text NOT NULL,
  "updated_at" text NOT NULL
);

CREATE TABLE IF NOT EXISTS "host_update_runs" (
  "id" text PRIMARY KEY NOT NULL,
  "node_id" text NOT NULL,
  "kind" text NOT NULL,
  "status" text NOT NULL,
  "packages" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "reboot_required" boolean DEFAULT false NOT NULL,
  "stdout" text,
  "stderr" text,
  "error_message" text,
  "started_at" text,
  "completed_at" text,
  "created_at" text NOT NULL
);
