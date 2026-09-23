import type {
    ApiKey,
    BackupTask,
    ContainerRegistryImage,
    CreatedApiKey,
    Instance,
    LogRotationTask,
    Node,
    NodeProvision,
    PipelineRunKind,
    PipelineRunStatus,
    TargetGroup,
    CreateTargetGroupBody,
    UpdateTargetGroupBody,
    ResolvedSecret,
    Secret,
    Service,
    Volume
} from "@naulite/shared";

/**
 * Well-known platform discovery payload.
 */
export interface NauliteDiscovery {
    name: string;
    version: string;
    authRequired: boolean;
    defaultPort: number;
    localBypass: boolean;
}

export type { AdminLoginInput, AdminLoginResponse, AdminRole, AdminSession, AdminUser, BffLoginResponse, BffSessionResponse, CreateAdminUserInput, DisableAdminUserInput, UpdateAdminUserInput } from "./auth-types";
export type { HostInventory, HostInventoryPage, HostInventoryStatusFilter, HostUpdateRun } from "@naulite/shared";
export type { PaginatedResponse, PaginationQuery } from "./pagination-types";
export type { PromQLInstantResponse, PromQLRangeResponse, PromQLSample, PromQLSeries } from "./metrics-types";

/**
 * Header name for CSRF double-submit protection on the admin BFF.
 */
export const NAULITE_CSRF_HEADER = "x-csrf-token";

/**
 * Options for creating a platform HTTP client.
 */
export interface NauliteClientOptions {
    baseUrl: string;
    token?: string;
    sessionToken?: string;
    csrfToken?: string;
    credentials?: "omit" | "same-origin" | "include";
    fetchImpl?: typeof fetch;
    controlPlaneInstances?: string[];
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
    runId?: string;
    dispatch?: Array<{
        nodeId: string;
        planId: string;
        status: string;
        agentUrl?: string;
    }>;
}

/**
 * Async apply acknowledgement returned before background execution completes.
 */
export interface ApplyAcceptedPayload {
    runId: string;
    manifestName: string;
    accepted: true;
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
    runId?: string;
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

export interface FunctionRunSummary {
    id: string;
    serviceName: string;
    manifestName: string;
    nodeId: string;
    status: string;
    source: string;
    startedAt?: string;
    completedAt?: string;
    exitCode?: number;
}

export interface FunctionRun {
    id: string;
    serviceId: string;
    serviceName: string;
    manifestName: string;
    nodeId: string;
    status: string;
    source: string;
    exitCode?: number;
    logs?: string;
    payload: Record<string, unknown>;
    startedAt?: string;
    completedAt?: string;
    durationMs?: number;
    errorMessage?: string;
    createdAt: string;
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
 * Node provision request payload for POST /nodes/provision.
 */
export interface ProvisionNodeInput {
    provider?: string;
    instanceType: string;
    amiId: string;
    labels?: Record<string, string>;
    capabilities?: string[];
    count?: number;
    region?: string;
    subnetId?: string;
    securityGroupIds?: string[];
    iamInstanceProfile?: string;
    keyName?: string;
}

/**
 * Build response payload.
 */
export interface BuildResponse {
    serviceName?: string;
    imageRef?: string;
    logs?: string;
    durationMs?: number;
    runId?: string;
    workflowId?: string;
    buildId?: string;
    status?: "queued" | "running" | "succeeded" | "failed";
}

/**
 * Filters for listing pipeline runs.
 */
export interface ListPipelineRunsQuery {
    kind?: PipelineRunKind;
    status?: PipelineRunStatus;
    service?: string;
    pool?: string;
    since?: string;
    limit?: number;
    page?: number;
}

export type { PipelineEvent, PipelineRun, PipelineRunKind, PipelineRunStatus, PipelineStep } from "@naulite/shared";
export type { HostPackage, NodeResources } from "@naulite/shared";

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
 * Gateway route summary persisted by the control plane.
 */
export interface GatewayRouteSummary {
    id: string;
    serviceName: string;
    host: string;
    targetHost: string;
    targetPort: number;
    autoTls: boolean;
    updatedAt: string;
}

/**
 * Container registry image metadata returned by HEAD /cr/images/:name/:tag.
 */
export interface ContainerRegistryImageHead {
    digest: string;
    sizeBytes: number;
    contentType: string;
}

/**
 * Container registry image deletion response.
 */
export interface ContainerRegistryImageDeleteResult {
    deleted: true;
    name: string;
    tag: string;
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
 * NetBird topology summary.
 */
export interface NetBirdTopology {
    groups: NetBirdGroup[];
    devices: NetBirdDevice[];
    acls: NetBirdAcl[];
}

/**
 * NetBird enrollment details for infrastructure nodes and team devices.
 */
export interface NetBirdEnrollment {
    setupKey: string;
    cpUrl: string;
    netbirdManagementUrl: string;
    agentInstallScriptUrl: string;
}

/**
 * NetBird device record returned by the control plane.
 */
export interface NetBirdDevice {
    id: string;
    name: string;
    hostname?: string;
    groups?: string[];
    online?: boolean;
    connected?: boolean;
    [key: string]: unknown;
}

/**
 * NetBird group record returned by the control plane.
 */
export interface NetBirdGroup {
    id: string;
    name: string;
    peers?: string[];
    [key: string]: unknown;
}

/**
 * NetBird ACL record returned by the control plane.
 */
export interface NetBirdAcl {
    id: string;
    name?: string;
    sourceGroups?: string[];
    destinationGroups?: string[];
    ports?: number[];
    protocol?: "tcp" | "udp" | "all" | string;
    [key: string]: unknown;
}

/**
 * Secret upsert payload for cluster secrets API.
 */
export interface UpsertSecretInput {
    name: string;
    data: Record<string, string>;
    scope?: "cluster" | "service";
    serviceName?: string;
    description?: string;
}

/**
 * Notification destination configured through the admin panel.
 */
export interface NotificationDestination {
    id: string;
    name: string;
    type: "SLACK" | "WEBHOOK";
    url: string;
    secretConfigured: boolean;
    enabled: boolean;
    allowedKinds: PipelineEventKind[];
    createdAt: string;
    updatedAt: string;
}

export interface CreateNotificationDestinationInput {
    name: string;
    type: "SLACK" | "WEBHOOK";
    url: string;
    secret?: string;
    enabled?: boolean;
    allowedKinds?: PipelineEventKind[];
}

export interface UpdateNotificationDestinationInput {
    name?: string;
    type?: "SLACK" | "WEBHOOK";
    url?: string;
    secret?: string;
    enabled?: boolean;
    allowedKinds?: PipelineEventKind[];
}

/**
 * Notification provider environment status.
 */
export interface NotificationProviderStatus {
    id: string;
    type: "notification";
    registered: boolean;
    urlConfigured: boolean;
    secretConfigured: boolean;
    env: {
        urlVars: string[];
        secretVars: string[];
    };
}

/**
 * Result of a notification provider test ping.
 */
export interface NotificationTestResult {
    id: string;
    ok: boolean;
    error?: string;
}

/**
 * Pipeline event kinds used for notification filters.
 */
export type PipelineEventKind =
    | "ci.build.submitted"
    | "image.build.started"
    | "build.step.started"
    | "build.step.finished"
    | "image.pushed"
    | "rollout.started"
    | "rollout.finished"
    | "ci.build.finished"
    | "ci.pipeline.failed"
    | "gitops.sync.started"
    | "infra.sync.finished"
    | "node.disk_pressure"
    | "node.disk_pressure.cleared"
    | "node.left_cluster"
    | "node.joined_cluster"
    | "deploy.step.started"
    | "deploy.step.finished"
    | "deploy.step.failed";

/**
 * Notification provider event filter configuration.
 */
export interface NotificationProviderFilters {
    providerId: string;
    allowedKinds: PipelineEventKind[];
}

/**
 * Result of a manual or automatic instance reconciliation attempt.
 */
export interface InstanceReconcileResult {
    instanceId: string;
    status: "dispatched" | "skipped" | "failed";
    message?: string;
}

/**
 * Result of reconciling every stuck instance for a service.
 */
export interface ServiceReconcileResult {
    serviceName: string;
    results: InstanceReconcileResult[];
}

export type {
    ApiKey,
    BackupTask,
    ContainerRegistryImage,
    CreateTargetGroupBody,
    CreatedApiKey,
    Instance,
    LogRotationTask,
    Node,
    NodeProvision,
    ResolvedSecret,
    Secret,
    Service,
    TargetGroup,
    UpdateTargetGroupBody,
    Volume
};

export type { SandboxTemplate, UpdateSandboxTemplateBody, CreateSandboxTemplateBody, SandboxInstance } from "@naulite/shared";