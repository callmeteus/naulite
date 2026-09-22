CREATE TABLE IF NOT EXISTS "sandbox_templates" (
    "id" text PRIMARY KEY NOT NULL,
    "node_id" text NOT NULL REFERENCES "nodes"("id") ON DELETE CASCADE,
    "incus_name" text NOT NULL,
    "snapshot" text NOT NULL DEFAULT 'base',
    "modules_volume" text,
    "warm_pool_size" integer NOT NULL DEFAULT 0,
    "bake_cron" text,
    "baked_at" text,
    "size_bytes" bigint,
    "created_at" text NOT NULL,
    "updated_at" text NOT NULL
);

CREATE TABLE IF NOT EXISTS "sandbox_instances" (
    "id" text PRIMARY KEY NOT NULL,
    "parent_id" text NOT NULL REFERENCES "sandbox_templates"("id") ON DELETE CASCADE,
    "run_id" text,
    "incus_name" text NOT NULL,
    "kind" text NOT NULL,
    "status" text NOT NULL,
    "created_at" text NOT NULL,
    "destroyed_at" text
);

CREATE INDEX IF NOT EXISTS "sandbox_instances_parent_status_idx" ON "sandbox_instances" ("parent_id", "status");
CREATE INDEX IF NOT EXISTS "sandbox_instances_run_id_idx" ON "sandbox_instances" ("run_id");
