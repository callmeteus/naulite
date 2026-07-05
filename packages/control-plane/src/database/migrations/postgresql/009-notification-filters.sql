CREATE TABLE IF NOT EXISTS "notification_provider_filters" (
    "provider_id" text PRIMARY KEY NOT NULL,
    "allowed_kinds" jsonb NOT NULL DEFAULT '[]'::jsonb,
    "updated_at" text NOT NULL
);
