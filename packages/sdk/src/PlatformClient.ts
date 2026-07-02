import { PlatformApiError } from "./PlatformApiError.js";
import type {
    ApiKey,
    ApplyResponse,
    BackupRun,
    BackupTask,
    BuildRequest,
    BuildResponse,
    ClusterHealth,
    ClusterStatus,
    CreatedApiKey,
    ExecResponse,
    GitOpsWebhookPayload,
    IngressSummary,
    Instance,
    LogRotationRun,
    LogRotationTask,
    LogsResponse,
    NetBirdTopology,
    PlatformClientOptions,
    PlatformDiscovery,
    RegistryResponse,
    Secret,
    Service,
    Volume
} from "./types.js";
import type { Node } from "./types.js";

/**
 * Typed HTTP client for all control plane REST routes.
 */
export class PlatformClient {
    private readonly baseUrl: string;
    private readonly token?: string;
    private readonly fetchImpl: typeof fetch;

    /**
     * Creates a platform API client.
     * 
     * @param options Client configuration
     */
    constructor(options: PlatformClientOptions) {
        this.baseUrl = options.baseUrl.replace(/\/$/, "");
        this.token = options.token;
        this.fetchImpl = options.fetchImpl ?? fetch;
    }

    /**
     * Returns control plane health.
     * 
     * @returns Health summary
     */
    async getHealth(): Promise<ClusterHealth> {
        return this.request<ClusterHealth>("GET", "/health");
    }

    /**
     * Returns cluster status including leader and revision metadata.
     * 
     * @returns Cluster status payload
     */
    async getClusterStatus(): Promise<ClusterStatus> {
        return this.request<ClusterStatus>("GET", "/cluster/status");
    }

    /**
     * Lists registered cluster nodes.
     * 
     * @returns Registered nodes
     */
    async listNodes(): Promise<Node[]> {
        return this.request<Node[]>("GET", "/nodes");
    }

    /**
     * Returns a single node by id.
     * 
     * @param nodeId Node identifier
     * @returns Node record
     */
    async getNode(nodeId: string): Promise<Node> {
        return this.request<Node>("GET", `/nodes/${encodeURIComponent(nodeId)}`);
    }

    /**
     * Registers or updates a node.
     * 
     * @param node Node registration payload
     * @returns Registered node
     */
    async registerNode(node: Partial<Node> & { id: string; hostname: string }): Promise<Node> {
        return this.request<Node>("POST", "/nodes/register", node);
    }

    /**
     * Lists desired services.
     * 
     * @returns Service records
     */
    async listServices(): Promise<Service[]> {
        return this.request<Service[]>("GET", "/services");
    }

    /**
     * Lists running instances.
     * 
     * @returns Instance records
     */
    async listInstances(): Promise<Instance[]> {
        return this.request<Instance[]>("GET", "/instances");
    }

    /**
     * Lists cluster volumes.
     * 
     * @returns Volume records
     */
    async listVolumes(): Promise<Volume[]> {
        return this.request<Volume[]>("GET", "/volumes");
    }

    /**
     * Lists cluster secrets metadata.
     * 
     * @returns Secret metadata records
     */
    async listSecrets(): Promise<Secret[]> {
        return this.request<Secret[]>("GET", "/secrets");
    }

    /**
     * Lists backup runs.
     * 
     * @returns Backup run summaries
     */
    async listBackups(): Promise<BackupRun[]> {
        return this.request<BackupRun[]>("GET", "/backups");
    }

    /**
     * Applies a compose manifest to the cluster.
     * 
     * @param manifestYaml Raw compose manifest YAML
     * @returns Apply summary
     */
    async applyManifest(manifestYaml: string): Promise<ApplyResponse> {
        return this.request<ApplyResponse>("POST", "/apply", { manifest: manifestYaml });
    }

    /**
     * Deletes a service by name.
     * 
     * @param serviceName Service name
     * @returns Nothing.
     */
    async deleteService(serviceName: string): Promise<void> {
        await this.request<void>("DELETE", `/services/${encodeURIComponent(serviceName)}`);
    }

    /**
     * Deletes a volume by name.
     * 
     * @param volumeName Volume name
     * @returns Nothing.
     */
    async deleteVolume(volumeName: string): Promise<void> {
        await this.request<void>("DELETE", `/volumes/${encodeURIComponent(volumeName)}`);
    }

    /**
     * Deletes a secret by name.
     * 
     * @param secretName Secret name
     * @returns Nothing.
     */
    async deleteSecret(secretName: string): Promise<void> {
        await this.request<void>("DELETE", `/secrets/${encodeURIComponent(secretName)}`);
    }

    /**
     * Streams or fetches logs for an instance.
     * 
     * @param instanceId Instance identifier
     * @param tail Number of lines to return
     * @returns Log lines
     */
    async getLogs(instanceId: string, tail = 200): Promise<LogsResponse> {
        return this.request<LogsResponse>(
            "GET",
            `/instances/${encodeURIComponent(instanceId)}/logs?tail=${tail}`
        );
    }

    /**
     * Executes a command inside an instance.
     * 
     * @param instanceId Instance identifier
     * @param command Command argv array
     * @returns Exec result
     */
    async exec(instanceId: string, command: string[]): Promise<ExecResponse> {
        return this.request<ExecResponse>(
            "POST",
            `/instances/${encodeURIComponent(instanceId)}/exec`,
            { command }
        );
    }

    /**
     * Triggers a service image build.
     * 
     * @param request Build request payload
     * @returns Build response
     */
    async build(request: BuildRequest): Promise<BuildResponse> {
        return this.request<BuildResponse>("POST", "/build", request);
    }

    /**
     * Lists configured registries.
     * 
     * @returns Registry names
     */
    async listRegistries(): Promise<RegistryResponse> {
        return this.request<RegistryResponse>("GET", "/registry");
    }

    /**
     * Lists ingress routes.
     * 
     * @returns Ingress summaries
     */
    async listIngress(): Promise<IngressSummary[]> {
        return this.request<IngressSummary[]>("GET", "/ingress");
    }

    /**
     * Triggers a backup for a volume.
     * 
     * @param volumeName Volume name
     * @param task Optional backup task override
     * @returns Backup run summary
     */
    async runBackup(volumeName: string, task?: Partial<BackupTask>): Promise<BackupRun> {
        return this.request<BackupRun>("POST", `/backups/${encodeURIComponent(volumeName)}/run`, task);
    }

    /**
     * Restores a backup run.
     * 
     * @param backupId Backup run identifier
     * @returns Restored backup summary
     */
    async restoreBackup(backupId: string): Promise<BackupRun> {
        return this.request<BackupRun>("POST", `/backups/${encodeURIComponent(backupId)}/restore`);
    }

    /**
     * Triggers log rotation for a service.
     * 
     * @param serviceName Service name
     * @param task Optional rotation task override
     * @returns Log rotation run summary
     */
    async rotateLogs(serviceName: string, task?: Partial<LogRotationTask>): Promise<LogRotationRun> {
        return this.request<LogRotationRun>(
            "POST",
            `/services/${encodeURIComponent(serviceName)}/logs/rotate`,
            task
        );
    }

    /**
     * Handles a GitOps webhook notification.
     * 
     * @param payload Webhook payload
     * @returns Apply summary when a deploy is triggered
     */
    async gitOpsWebhook(payload: GitOpsWebhookPayload): Promise<ApplyResponse> {
        return this.request<ApplyResponse>("POST", "/gitops/webhook", payload);
    }

    /**
     * Returns NetBird topology summary (stub).
     * 
     * @returns Topology summary
     */
    async getNetBirdTopology(): Promise<NetBirdTopology> {
        return this.request<NetBirdTopology>("GET", "/netbird/topology");
    }

    /**
     * Returns platform discovery metadata for CLI auto-configuration.
     * 
     * @returns Well-known platform metadata
     */
    async getPlatformDiscovery(): Promise<PlatformDiscovery> {
        return this.request<PlatformDiscovery>("GET", "/.well-known/platform");
    }

    /**
     * Lists panel-generated API keys (metadata only).
     * 
     * @returns API key metadata records
     */
    async listApiKeys(): Promise<ApiKey[]> {
        return this.request("GET", "/api-keys");
    }

    /**
     * Creates a new API key from the control plane host.
     * 
     * @param name Human-readable key label
     * @returns Created key metadata plus plaintext secret
     */
    async createApiKey(name: string): Promise<CreatedApiKey> {
        return this.request("POST", "/api-keys", { name });
    }

    /**
     * Revokes an API key by id.
     * 
     * @param apiKeyId API key identifier
     * @returns Nothing.
     */
    async revokeApiKey(apiKeyId: string): Promise<void> {
        await this.request("DELETE", `/api-keys/${encodeURIComponent(apiKeyId)}`);
    }

    /**
     * Performs an HTTP request against the control plane.
     * 
     * @param method HTTP method
     * @param path API path
     * @param body Optional JSON body
     * @returns Parsed JSON response
     */
    private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
        const headers: Record<string, string> = {
            Accept: "application/json"
        };

        if (body !== undefined) {
            headers["Content-Type"] = "application/json";
        }

        if (this.token) {
            headers.Authorization = `Bearer ${this.token}`;
        }

        const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body)
        });

        const text = await response.text();
        const parsed = text.length > 0 ? JSON.parse(text) as unknown : undefined;

        if (!response.ok) {
            const message =
                typeof parsed === "object" &&
                parsed !== null &&
                "message" in parsed &&
                typeof parsed.message === "string"
                    ? parsed.message
                    : `Request failed with status ${response.status}`;

            throw new PlatformApiError(response.status, message, parsed);
        }

        return parsed as T;
    }
}

export { PlatformApiError } from "./PlatformApiError.js";
export type * from "./types.js";
