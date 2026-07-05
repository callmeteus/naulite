CREATE TABLE IF NOT EXISTS "node_provisions" (
    "id" text PRIMARY KEY NOT NULL,
    "provider" text NOT NULL,
    "cloud_instance_id" text,
    "status" text NOT NULL,
    "node_id" text,
    "instance_type" text NOT NULL,
    "ami_id" text NOT NULL,
    "labels" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "region" text,
    "error" text,
    "created_at" text NOT NULL,
    "updated_at" text NOT NULL
);

CREATE INDEX IF NOT EXISTS "node_provisions_status_idx" ON "node_provisions" ("status");
