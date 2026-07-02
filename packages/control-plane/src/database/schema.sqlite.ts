import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Registered cluster nodes reported by agents.
 */
export const nodes = sqliteTable("nodes", {
    id: text("id").primaryKey(),
    hostname: text("hostname").notNull(),
    status: text("status").notNull(),
    labels: text("labels").notNull().default("{}"),
    capabilities: text("capabilities").notNull().default("[]"),
    resources: text("resources").notNull().default("{}"),
    agentVersion: text("agent_version").notNull(),
    netbirdDeviceId: text("netbird_device_id"),
    lastHeartbeatAt: text("last_heartbeat_at").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
});

/**
 * Desired services derived from applied manifests.
 */
export const services = sqliteTable("services", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    manifestName: text("manifest_name").notNull(),
    image: text("image").notNull(),
    desiredReplicas: integer("desired_replicas").notNull().default(1),
    status: text("status").notNull(),
    cluster: text("cluster"),
    capabilities: text("capabilities").notNull().default("[]"),
    networks: text("networks").notNull().default("[]"),
    ingress: text("ingress"),
    logRotation: text("log_rotation"),
    lifecycleStatus: text("lifecycle_status"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
});

/**
 * Running or pending service instances scheduled on nodes.
 */
export const instances = sqliteTable("instances", {
    id: text("id").primaryKey(),
    serviceId: text("service_id").notNull(),
    serviceName: text("service_name").notNull(),
    nodeId: text("node_id").notNull(),
    status: text("status").notNull(),
    containerId: text("container_id"),
    image: text("image").notNull(),
    resources: text("resources"),
    health: text("health"),
    lifecycleStatus: text("lifecycle_status"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
});

/**
 * Persistent volumes tracked by the control plane.
 */
export const volumes = sqliteTable("volumes", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    manifestName: text("manifest_name").notNull(),
    scope: text("scope").notNull().default("cluster"),
    nodeId: text("node_id"),
    mountPath: text("mount_path").notNull(),
    sizeMb: integer("size_mb"),
    status: text("status").notNull(),
    backup: text("backup"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
});

/**
 * Cluster secret metadata. Values are stored encrypted in the value column.
 */
export const secrets = sqliteTable("secrets", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    keys: text("keys").notNull().default("[]"),
    scope: text("scope").notNull().default("cluster"),
    serviceName: text("service_name"),
    description: text("description"),
    value: text("value").notNull().default("{}"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
});

/**
 * Historical backup runs dispatched to agents.
 */
export const backupRuns = sqliteTable("backup_runs", {
    id: text("id").primaryKey(),
    volumeId: text("volume_id").notNull(),
    volumeName: text("volume_name").notNull(),
    nodeId: text("node_id").notNull(),
    status: text("status").notNull(),
    payload: text("payload").notNull().default("{}"),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    errorMessage: text("error_message"),
    createdAt: text("created_at").notNull()
});

/**
 * Historical log rotation runs dispatched to agents.
 */
export const logRotationRuns = sqliteTable("log_rotation_runs", {
    id: text("id").primaryKey(),
    instanceId: text("instance_id").notNull(),
    serviceName: text("service_name").notNull(),
    nodeId: text("node_id").notNull(),
    status: text("status").notNull(),
    payload: text("payload").notNull().default("{}"),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    rotatedFiles: text("rotated_files").notNull().default("[]"),
    errorMessage: text("error_message"),
    createdAt: text("created_at").notNull()
});

/**
 * Git revision history for applied manifests.
 */
export const gitRevisions = sqliteTable("git_revisions", {
    id: text("id").primaryKey(),
    repositoryUrl: text("repository_url").notNull(),
    branch: text("branch").notNull(),
    commitSha: text("commit_sha").notNull(),
    manifestName: text("manifest_name").notNull(),
    manifestYaml: text("manifest_yaml").notNull(),
    overlayPaths: text("overlay_paths").notNull().default("[]"),
    appliedAt: text("applied_at").notNull(),
    rolledBackFromId: text("rolled_back_from_id")
});

/**
 * PostgreSQL control-plane event stream for multi-instance sync.
 */
export const controlPlaneEvents = sqliteTable("control_plane_events", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    eventType: text("event_type").notNull(),
    payload: text("payload").notNull().default("{}"),
    sourceInstanceId: text("source_instance_id").notNull(),
    createdAt: text("created_at").notNull()
});

/**
 * Panel-generated CLI API keys (hashed at rest).
 */
export const apiKeys = sqliteTable("api_keys", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    keyHash: text("key_hash").notNull(),
    createdAt: text("created_at").notNull(),
    lastUsedAt: text("last_used_at"),
    revokedAt: text("revoked_at")
});

/**
 * SQLite schema tables exported for Drizzle.
 */
export const sqliteSchema = {
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

export type SqliteSchema = typeof sqliteSchema;
