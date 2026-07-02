import type {
    ApiKey,
    BackupTask,
    CreatedApiKey,
    Instance,
    LogRotationTask,
    Node,
    Secret,
    Service,
    Volume
} from "@platform/shared";

/**
 * Well-known platform discovery payload.
 */
export interface PlatformDiscovery {
    name: string;
    version: string;
    authRequired: boolean;
    defaultPort: number;
    localBypass: boolean;
}

/**
 * Options for creating a platform HTTP client.
 */
export interface PlatformClientOptions {
    baseUrl: string;
    token?: string;
    fetchImpl?: typeof fetch;
}
/**
 * Cluster health summary returned by the control plane.
 */
export interface ClusterHealth {
    status: "healthy" | "degraded" | "unhealthy";
    controlPlaneId?: string;
    nodeCount: number;
    serviceCount: number;
}

/**
 * Cluster status payload returned by the control plane.
 */
export interface ClusterStatus {
    health: ClusterHealth;
    leaderId?: string;
    revision?: string;
    summary?: {
        nodes: number;
        onlineNodes: number;
        services: number;
        instances: number;
        runningInstances: number;
        volumes: number;
        secrets: number;
        applyRevision: number;
    };
    nodes?: Node[];
    services?: Service[];
    instances?: Instance[];
    volumes?: Volume[];
    secrets?: Secret[];
}

/**
 * Apply manifest response.
 */
export interface ApplyResponse {
    revision: string | number;
    manifestName: string;
    servicesCreated: number;
    servicesUpdated: number;
    servicesDeleted: number;
    instancesToCreate?: number;
    dispatch?: Array<{
        nodeId: string;
        planId: string;
        status: string;
        agentUrl?: string;
    }>;
}

/**
 * Full apply payload returned directly by the control plane.
 */
export interface ApplyResultPayload {
    revision: number;
    manifestName: string;
    diff: {
        servicesToCreate: number;
        servicesToUpdate: number;
        servicesToRemove: number;
        instancesToCreate: number;
        instancesToRemove: number;
        volumesToEnsure: number;
        volumesToRemove: number;
    };
    dispatch: Array<{
        nodeId: string;
        planId: string;
        status: string;
        agentUrl?: string;
    }>;
}

/**
 * Backup run summary.
 */
export interface BackupRun {
    id: string;
    volumeName: string;
    status: "pending" | "running" | "succeeded" | "failed";
    startedAt?: string;
    completedAt?: string;
    destination?: string;
}

/**
 * Log rotation run summary.
 */
export interface LogRotationRun {
    id: string;
    serviceName: string;
    status: "pending" | "running" | "succeeded" | "failed";
    startedAt?: string;
    completedAt?: string;
}

/**
 * Build request payload.
 */
export interface BuildRequest {
    serviceName: string;
    provider?: string;
    registry?: string;
}

/**
 * Build response payload.
 */
export interface BuildResponse {
    buildId: string;
    status: "queued" | "running" | "succeeded" | "failed";
}

/**
 * Registry operation response.
 */
export interface RegistryResponse {
    registries: string[];
}

/**
 * Ingress summary.
 */
export interface IngressSummary {
    serviceName: string;
    hosts: string[];
    tlsEnabled: boolean;
}

/**
 * Exec response payload.
 */
export interface ExecResponse {
    exitCode: number;
    stdout: string;
    stderr: string;
}

/**
 * Logs response payload.
 */
export interface LogsResponse {
    lines: string[];
    truncated: boolean;
}

/**
 * GitOps webhook payload.
 */
export interface GitOpsWebhookPayload {
    repositoryUrl: string;
    revision: string;
    branch?: string;
}

/**
 * NetBird topology summary (stub).
 */
export interface NetBirdTopology {
    groups: string[];
    devices: string[];
}

export type {
    ApiKey,
    BackupTask,
    CreatedApiKey,
    Instance,
    LogRotationTask,
    Node,
    Secret,
    Service,
    Volume
};