import { integer, jsonb, pgTable, serial, text } from "drizzle-orm/pg-core";

/**
 * Registered cluster nodes reported by agents.
 */
export const nodes = pgTable("nodes", {
    id: text("id").primaryKey(),
    hostname: text("hostname").notNull(),
    status: text("status").notNull(),
    labels: jsonb("labels").notNull().default({}),
    capabilities: jsonb("capabilities").notNull().default([]),
    resources: jsonb("resources").notNull().default({}),
    agentVersion: text("agent_version").notNull(),
    netbirdDeviceId: text("netbird_device_id"),
    lastHeartbeatAt: text("last_heartbeat_at").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
});

/**
 * Desired services derived from applied manifests.
 */
export const services = pgTable("services", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    manifestName: text("manifest_name").notNull(),
    image: text("image").notNull(),
    desiredReplicas: integer("desired_replicas").notNull().default(1),
    status: text("status").notNull(),
    cluster: jsonb("cluster"),
    capabilities: jsonb("capabilities").notNull().default([]),
    networks: jsonb("networks").notNull().default([]),
    ingress: jsonb("ingress"),
    logRotation: jsonb("log_rotation"),
    lifecycleStatus: text("lifecycle_status"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
});

/**
 * Running or pending service instances scheduled on nodes.
 */
export const instances = pgTable("instances", {
    id: text("id").primaryKey(),
    serviceId: text("service_id").notNull(),
    serviceName: text("service_name").notNull(),
    nodeId: text("node_id").notNull(),
    status: text("status").notNull(),
    containerId: text("container_id"),
    image: text("image").notNull(),
    resources: jsonb("resources"),
    health: jsonb("health"),
    lifecycleStatus: text("lifecycle_status"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
});

/**
 * Persistent volumes tracked by the control plane.
 */
export const volumes = pgTable("volumes", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    manifestName: text("manifest_name").notNull(),
    scope: text("scope").notNull().default("cluster"),
    nodeId: text("node_id"),
    mountPath: text("mount_path").notNull(),
    sizeMb: integer("size_mb"),
    status: text("status").notNull(),
    backup: jsonb("backup"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
});

/**
 * Cluster secret metadata with encrypted payload.
 */
export const secrets = pgTable("secrets", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    keys: jsonb("keys").notNull().default([]),
    scope: text("scope").notNull().default("cluster"),
    serviceName: text("service_name"),
    description: text("description"),
    value: jsonb("value").notNull().default({}),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
});

/**
 * Historical backup runs dispatched to agents.
 */
export const backupRuns = pgTable("backup_runs", {
    id: text("id").primaryKey(),
    volumeId: text("volume_id").notNull(),
    volumeName: text("volume_name").notNull(),
    nodeId: text("node_id").notNull(),
    status: text("status").notNull(),
    payload: jsonb("payload").notNull().default({}),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    errorMessage: text("error_message"),
    createdAt: text("created_at").notNull()
});

/**
 * Historical log rotation runs dispatched to agents.
 */
export const logRotationRuns = pgTable("log_rotation_runs", {
    id: text("id").primaryKey(),
    instanceId: text("instance_id").notNull(),
    serviceName: text("service_name").notNull(),
    nodeId: text("node_id").notNull(),
    status: text("status").notNull(),
    payload: jsonb("payload").notNull().default({}),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    rotatedFiles: jsonb("rotated_files").notNull().default([]),
    errorMessage: text("error_message"),
    createdAt: text("created_at").notNull()
});

/**
 * Git revision history for applied manifests.
 */
export const gitRevisions = pgTable("git_revisions", {
    id: text("id").primaryKey(),
    repositoryUrl: text("repository_url").notNull(),
    branch: text("branch").notNull(),
    commitSha: text("commit_sha").notNull(),
    manifestName: text("manifest_name").notNull(),
    manifestYaml: text("manifest_yaml").notNull(),
    overlayPaths: jsonb("overlay_paths").notNull().default([]),
    appliedAt: text("applied_at").notNull(),
    rolledBackFromId: text("rolled_back_from_id")
});

/**
 * PostgreSQL control-plane event stream for multi-instance sync.
 */
export const controlPlaneEvents = pgTable("control_plane_events", {
    id: serial("id").primaryKey(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull().default({}),
    sourceInstanceId: text("source_instance_id").notNull(),
    createdAt: text("created_at").notNull()
});

/**
 * Panel-generated CLI API keys (hashed at rest).
 */
export const apiKeys = pgTable("api_keys", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    keyHash: text("key_hash").notNull(),
    createdAt: text("created_at").notNull(),
    lastUsedAt: text("last_used_at"),
    revokedAt: text("revoked_at")
});

/**
 * PostgreSQL schema tables exported for Drizzle.
 */
export const postgresSchema = {
    nodes,
    services,
    instances,
    volumes,
    secrets,
    backupRuns,
    logRotationRuns,
    gitRevisions,
    controlPlaneEvents,
    apiKeys
};

export type PostgresSchema = typeof postgresSchema;
