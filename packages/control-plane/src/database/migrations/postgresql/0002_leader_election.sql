CREATE TABLE IF NOT EXISTS "control_plane_leaders" (
  "lease_key" text PRIMARY KEY NOT NULL,
  "leader_instance_id" text NOT NULL,
  "expires_at" text NOT NULL,
  "updated_at" text NOT NULL
);

CREATE TABLE IF NOT EXISTS "cluster_state" (
  "key" text PRIMARY KEY NOT NULL,
  "value" text NOT NULL,
  "updated_at" text NOT NULL
);
