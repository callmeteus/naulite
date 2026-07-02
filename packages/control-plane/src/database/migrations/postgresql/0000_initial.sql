CREATE TABLE IF NOT EXISTS "nodes" (
  "id" text PRIMARY KEY NOT NULL,
  "hostname" text NOT NULL,
  "status" text NOT NULL,
  "labels" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "resources" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "agent_version" text NOT NULL,
  "netbird_device_id" text,
  "last_heartbeat_at" text NOT NULL,
  "created_at" text NOT NULL,
  "updated_at" text NOT NULL
);

CREATE TABLE IF NOT EXISTS "services" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "manifest_name" text NOT NULL,
  "image" text NOT NULL,
  "desired_replicas" integer DEFAULT 1 NOT NULL,
  "status" text NOT NULL,
  "cluster" jsonb,
  "capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "networks" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "ingress" jsonb,
  "log_rotation" jsonb,
  "lifecycle_status" text,
  "created_at" text NOT NULL,
  "updated_at" text NOT NULL
);

CREATE TABLE IF NOT EXISTS "instances" (
  "id" text PRIMARY KEY NOT NULL,
  "service_id" text NOT NULL,
  "service_name" text NOT NULL,
  "node_id" text NOT NULL,
  "status" text NOT NULL,
  "container_id" text,
  "image" text NOT NULL,
  "resources" jsonb,
  "health" jsonb,
  "lifecycle_status" text,
  "created_at" text NOT NULL,
  "updated_at" text NOT NULL
);

CREATE TABLE IF NOT EXISTS "volumes" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "manifest_name" text NOT NULL,
  "scope" text DEFAULT 'cluster' NOT NULL,
  "node_id" text,
  "mount_path" text NOT NULL,
  "size_mb" integer,
  "status" text NOT NULL,
  "backup" jsonb,
  "created_at" text NOT NULL,
  "updated_at" text NOT NULL
);

CREATE TABLE IF NOT EXISTS "secrets" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "scope" text DEFAULT 'cluster' NOT NULL,
  "service_name" text,
  "description" text,
  "value" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" text NOT NULL,
  "updated_at" text NOT NULL
);

CREATE TABLE IF NOT EXISTS "backup_runs" (
  "id" text PRIMARY KEY NOT NULL,
  "volume_id" text NOT NULL,
  "volume_name" text NOT NULL,
  "node_id" text NOT NULL,
  "status" text NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "started_at" text,
  "completed_at" text,
  "error_message" text,
  "created_at" text NOT NULL
);

CREATE TABLE IF NOT EXISTS "log_rotation_runs" (
  "id" text PRIMARY KEY NOT NULL,
  "instance_id" text NOT NULL,
  "service_name" text NOT NULL,
  "node_id" text NOT NULL,
  "status" text NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "started_at" text,
  "completed_at" text,
  "rotated_files" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "error_message" text,
  "created_at" text NOT NULL
);

CREATE TABLE IF NOT EXISTS "git_revisions" (
  "id" text PRIMARY KEY NOT NULL,
  "repository_url" text NOT NULL,
  "branch" text NOT NULL,
  "commit_sha" text NOT NULL,
  "manifest_name" text NOT NULL,
  "manifest_yaml" text NOT NULL,
  "overlay_paths" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "applied_at" text NOT NULL,
  "rolled_back_from_id" text
);

CREATE TABLE IF NOT EXISTS "control_plane_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "event_type" text NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "source_instance_id" text NOT NULL,
  "created_at" text NOT NULL
);
