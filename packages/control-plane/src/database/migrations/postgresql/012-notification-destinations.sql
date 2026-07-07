CREATE TABLE IF NOT EXISTS "notification_destinations" (
    "id" text PRIMARY KEY NOT NULL,
    "name" text NOT NULL,
    "type" text NOT NULL,
    "url" text NOT NULL,
    "secret" text,
    "enabled" boolean NOT NULL DEFAULT true,
    "allowed_kinds" jsonb NOT NULL DEFAULT '[]'::jsonb,
    "created_at" text NOT NULL,
    "updated_at" text NOT NULL
);
