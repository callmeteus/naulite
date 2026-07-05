CREATE TABLE IF NOT EXISTS "container_registry_images" (
    "name" text NOT NULL,
    "tag" text NOT NULL,
    "digest" text NOT NULL,
    "size_bytes" integer NOT NULL,
    "destination" jsonb NOT NULL,
    "location" text NOT NULL,
    "pushed_at" text NOT NULL,
    PRIMARY KEY ("name", "tag")
);
