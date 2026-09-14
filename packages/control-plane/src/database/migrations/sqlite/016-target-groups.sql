CREATE TABLE IF NOT EXISTS "target_groups" (
    "id" text PRIMARY KEY NOT NULL,
    "name" text NOT NULL,
    "created_at" text NOT NULL,
    "updated_at" text NOT NULL
);

CREATE TABLE IF NOT EXISTS "target_group_members" (
    "group_id" text NOT NULL REFERENCES "target_groups"("id") ON DELETE CASCADE,
    "node_id" text NOT NULL REFERENCES "nodes"("id") ON DELETE CASCADE,
    PRIMARY KEY ("group_id", "node_id")
);

CREATE INDEX IF NOT EXISTS "target_group_members_node_id_idx" ON "target_group_members" ("node_id");
