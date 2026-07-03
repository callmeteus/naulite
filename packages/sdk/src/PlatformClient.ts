import { PlatformApiError } from "./PlatformApiError";
import type {
    AdminLoginInput,
    AdminLoginResponse,
    AdminSession,
    AdminUser,
    ApiKey,
    ApplyResponse,
    ApplyResultPayload,
    BackupRun,
    BackupTask,
    BuildRequest,
    BuildResponse,
    ClusterHealth,
    ClusterStatus,
    ContainerRegistryImage,
    ContainerRegistryImageDeleteResult,
    ContainerRegistryImageHead,
    CreateAdminUserInput,
    CreatedApiKey,
    DisableAdminUserInput,
    ExecResponse,
    GatewayRouteSummary,
    GitOpsWebhookPayload,
    IngressSummary,
    Instance,
    LogRotationRun,
    LogRotationTask,
    PaginatedResponse,
    PaginationQuery,
    PipelineEvent,
    PipelineRun,
    ListPipelineRunsQuery,
    LogsResponse,
    NetBirdAcl,
    NodeProvision,
    NetBirdDevice,
    NetBirdGroup,
    NetBirdTopology,
    PlatformClientOptions,
    PlatformDiscovery,
    PromQLInstantResponse,
    PromQLRangeResponse,
    ProvisionNodeInput,
    RegistryResponse,
    Secret,
    Service,
    UpsertSecretInput,
    Volume
} from "./types";
import type { Node } from "./types";

/**
 * Typed HTTP client for all control plane REST routes.
 */
export class PlatformClient {
    private readonly baseUrl: string;
    private readonly token?: string;
    private readonly sessionToken?: string;
    private readonly credentials?: "omit" | "same-origin" | "include";
    private readonly fetchImpl: typeof fetch;

    /**
     * Creates a platform API client.
     * 
     * @param options Client configuration
     */
    constructor(options: PlatformClientOptions) {
        this.baseUrl = options.baseUrl.replace(/\/$/, "");
        this.token = options.token;
        this.sessionToken = options.sessionToken;
        this.credentials = options.credentials;
        this.fetchImpl = options.fetchImpl ?? fetch;
    }

    /**
     * Returns a client clone that forwards the given session token to the control plane.
     *
     * @param sessionToken Opaque platform session token
     * @returns Cloned client with session forwarding enabled
     */
    withSession(sessionToken: string): PlatformClient {
        return new PlatformClient({
            baseUrl: this.baseUrl,
            token: this.token,
            sessionToken,
            credentials: this.credentials,
            fetchImpl: this.fetchImpl
        });
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
     * Authenticates against the admin BFF and sets the session cookie in the browser.
     *
     * @param input Login credentials
     * @returns Authenticated user profile
     */
    async login(input: AdminLoginInput): Promise<{ user: AdminUser }> {
        return this.request<{ user: AdminUser }>("POST", "/auth/login", input);
    }

    /**
     * Clears the browser session through the admin BFF.
     *
     * @returns Nothing.
     */
    async logout(): Promise<void> {
        await this.request<void>("POST", "/auth/logout");
    }

    /**
     * Returns the current browser session user from the admin BFF.
     *
     * @returns Session user or null when unauthenticated
     */
    async getSession(): Promise<{ user: AdminUser | null }> {
        return this.request<{ user: AdminUser | null }>("GET", "/auth/me");
    }

    /**
     * Authenticates an admin user and returns a session token.
     *
     * @param input Login credentials
     * @returns Session token and user profile
     */
    async adminLogin(input: AdminLoginInput): Promise<AdminLoginResponse> {
        return this.request<AdminLoginResponse>("POST", "/admin/login", input);
    }

    /**
     * Invalidates the current admin session on the control plane.
     *
     * @returns Nothing.
     */
    async adminLogout(): Promise<void> {
        await this.request<void>("POST", "/admin/logout");
    }

    /**
     * Returns the authenticated admin user for the current session.
     *
     * @returns Active admin session
     */
    async getAdminMe(): Promise<AdminSession> {
        return this.request<AdminSession>("GET", "/admin/me");
    }

    /**
     * Lists admin users (admin role required).
     *
     * @returns Admin user records
     */
    async listAdminUsers(): Promise<AdminUser[]> {
        return this.request<AdminUser[]>("GET", "/admin/users");
    }

    /**
     * Creates a new admin user (admin role required).
     *
     * @param input User creation payload
     * @returns Created admin user
     */
    async createAdminUser(input: CreateAdminUserInput): Promise<AdminUser> {
        return this.request<AdminUser>("POST", "/admin/users", input);
    }

    /**
     * Disables an admin user by identifier (admin role required).
     *
     * @param userId Admin user identifier
     * @param input Optional disable reason
     * @returns Updated admin user
     */
    async disableAdminUser(userId: string, input: DisableAdminUserInput = {}): Promise<AdminUser> {
        return this.request<AdminUser>(
            "POST",
            `/admin/users/${encodeURIComponent(userId)}/disable`,
            input
        );
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
     * Returns secret metadata by name.
     *
     * @param secretName Secret name
     * @returns Secret metadata
     */
    async getSecret(secretName: string): Promise<Secret> {
        return this.request<Secret>("GET", `/secrets/${encodeURIComponent(secretName)}`);
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
     * Lists backup runs with server-side pagination.
     *
     * @param query Pagination and filter parameters
     * @returns Paginated backup runs
     */
    async listBackupsPaginated(query: PaginationQuery = {}): Promise<PaginatedResponse<BackupRun>> {
        return this.requestPaginated<BackupRun>("GET", "/backups", query);
    }

    /**
     * Applies a compose manifest to the cluster.
     * 
     * @param manifestYaml Raw compose manifest YAML
     * @returns Apply summary
     */
    async applyManifest(manifestYaml: string): Promise<ApplyResponse> {
        const payload = await this.request<ApplyResultPayload>("POST", "/apply", { manifest: manifestYaml });

        return {
            revision: payload.revision,
            manifestName: payload.manifestName,
            servicesCreated: payload.diff.servicesToCreate,
            servicesUpdated: payload.diff.servicesToUpdate,
            servicesDeleted: payload.diff.servicesToRemove,
            instancesToCreate: payload.diff.instancesToCreate,
            runId: payload.runId,
            dispatch: payload.dispatch
        };
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
     * Creates or updates a cluster secret.
     *
     * @param input Secret upsert payload
     * @returns Stored secret metadata
     */
    async upsertSecret(input: UpsertSecretInput): Promise<Secret> {
        return this.request<Secret>("POST", "/secrets", input);
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
     * @param options Optional build options
     * @returns Build response
     */
    async build(request: BuildRequest, options: { wait?: boolean } = {}): Promise<BuildResponse> {
        const query = options.wait ? "?wait=true" : "";
        return this.request<BuildResponse>("POST", `/build${query}`, request);
    }

    /**
     * Triggers a service image build without waiting for completion.
     *
     * @param request Build request payload
     * @returns Build response
     */
    async triggerBuild(request: BuildRequest): Promise<BuildResponse> {
        return this.build(request);
    }

    /**
     * Lists pipeline runs with optional filters.
     *
     * @param query Optional list filters
     * @returns Pipeline runs
     */
    async listRuns(query: ListPipelineRunsQuery = {}): Promise<PipelineRun[]> {
        const params = new URLSearchParams();

        if (query.kind) {
            params.set("kind", query.kind);
        }
        if (query.status) {
            params.set("status", query.status);
        }
        if (query.service) {
            params.set("service", query.service);
        }
        if (query.pool) {
            params.set("pool", query.pool);
        }
        if (query.since) {
            params.set("since", query.since);
        }
        if (query.limit !== undefined) {
            params.set("limit", String(query.limit));
        }
        if (query.page !== undefined) {
            params.set("page", String(query.page));
        }

        const suffix = params.size > 0 ? `?${params.toString()}` : "";
        return this.request<PipelineRun[]>("GET", `/runs${suffix}`);
    }

    /**
     * Lists pipeline runs with server-side pagination.
     *
     * @param query Optional list filters and pagination
     * @returns Paginated pipeline runs
     */
    async listRunsPaginated(
        query: ListPipelineRunsQuery & PaginationQuery = {}
    ): Promise<PaginatedResponse<PipelineRun>> {
        const params = new URLSearchParams();

        if (query.kind) {
            params.set("kind", query.kind);
        }
        if (query.status) {
            params.set("status", query.status);
        }
        if (query.service) {
            params.set("service", query.service);
        }
        if (query.pool) {
            params.set("pool", query.pool);
        }
        if (query.since) {
            params.set("since", query.since);
        }
        if (query.limit !== undefined) {
            params.set("limit", String(query.limit));
        }
        if (query.page !== undefined) {
            params.set("page", String(query.page));
        }

        const suffix = params.size > 0 ? `?${params.toString()}` : "";
        return this.request<PaginatedResponse<PipelineRun>>("GET", `/runs${suffix}`);
    }

    /**
     * Returns a pipeline run with steps and events.
     *
     * @param runId Pipeline run identifier
     * @returns Pipeline run detail
     */
    async getRun(runId: string): Promise<PipelineRun> {
        return this.request<PipelineRun>("GET", `/runs/${encodeURIComponent(runId)}`);
    }

    /**
     * Lists timeline events for a pipeline run.
     *
     * @param runId Pipeline run identifier
     * @param since Optional event id lower bound
     * @returns Pipeline events
     */
    async getRunEvents(runId: string, since?: number): Promise<PipelineEvent[]> {
        const suffix = since !== undefined ? `?since=${since}` : "";
        return this.request<PipelineEvent[]>(
            "GET",
            `/runs/${encodeURIComponent(runId)}/events${suffix}`
        );
    }

    /**
     * Opens the control plane SSE stream for a pipeline run.
     *
     * @param runId Pipeline run identifier
     * @returns Raw fetch response for piping to clients
     */
    async openRunEventStream(runId: string): Promise<Response> {
        const headers: Record<string, string> = {
            Accept: "text/event-stream"
        };

        if (this.sessionToken) {
            headers["X-Platform-Session"] = this.sessionToken;
        }

        if (this.token) {
            headers.Authorization = `Bearer ${this.token}`;
        }

        return this.fetchImpl(
            `${this.baseUrl}/runs/${encodeURIComponent(runId)}/stream`,
            { headers, credentials: this.credentials }
        );
    }

    /**
     * Streams pipeline run events over SSE until the run completes.
     *
     * @param runId Pipeline run identifier
     * @returns Async iterator of pipeline events
     */
    async *streamRunEvents(runId: string): AsyncGenerator<PipelineEvent> {
        const headers: Record<string, string> = {
            Accept: "text/event-stream"
        };

        if (this.sessionToken) {
            headers["X-Platform-Session"] = this.sessionToken;
        }

        if (this.token) {
            headers.Authorization = `Bearer ${this.token}`;
        }

        const response = await this.fetchImpl(
            `${this.baseUrl}/runs/${encodeURIComponent(runId)}/stream`,
            { headers, credentials: this.credentials }
        );

        if (!response.ok || !response.body) {
            throw new PlatformApiError(response.status, `SSE stream failed with status ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();

            if (done) {
                break;
            }

            buffer += decoder.decode(value, { stream: true });

            while (true) {
                const boundary = buffer.indexOf("\n\n");

                if (boundary < 0) {
                    break;
                }

                const chunk = buffer.slice(0, boundary);
                buffer = buffer.slice(boundary + 2);
                const dataLine = chunk
                    .split("\n")
                    .find((line) => line.startsWith("data:"));

                if (!dataLine) {
                    continue;
                }

                const payload = dataLine.slice("data:".length).trim();

                if (!payload || payload === "[DONE]") {
                    continue;
                }

                yield JSON.parse(payload) as PipelineEvent;
            }
        }
    }

    /**
     * Provisions a cloud node and bootstraps a platform agent.
     *
     * @param input Node provision request payload
     * @returns Created node provision record
     */
    async provisionNode(input: ProvisionNodeInput): Promise<NodeProvision> {
        return this.request<NodeProvision>("POST", "/nodes/provision", input);
    }

    /**
     * Returns a node provision request by identifier.
     *
     * @param provisionId Node provision identifier
     * @returns Node provision record
     */
    async getNodeProvision(provisionId: string): Promise<NodeProvision> {
        return this.request<NodeProvision>(
            "GET",
            `/nodes/provisions/${encodeURIComponent(provisionId)}`
        );
    }

    /**
     * Lists node provision requests with server-side pagination.
     *
     * @param query Pagination parameters
     * @returns Paginated node provision records
     */
    async listNodeProvisions(query: PaginationQuery = {}): Promise<PaginatedResponse<NodeProvision>> {
        return this.requestPaginated<NodeProvision>("GET", "/nodes/provisions", query);
    }

    /**
     * Terminates a cloud instance for a node provision request.
     *
     * @param provisionId Node provision identifier
     * @returns Updated node provision record
     */
    async terminateNodeProvision(provisionId: string): Promise<NodeProvision> {
        return this.request<NodeProvision>(
            "POST",
            `/nodes/provisions/${encodeURIComponent(provisionId)}/terminate`
        );
    }

    /**
     * Lists Traefik gateway routes persisted by the control plane.
     *
     * @returns Gateway route summaries
     */
    async listGatewayRoutes(): Promise<GatewayRouteSummary[]> {
        return this.request<GatewayRouteSummary[]>("GET", "/gateway/routes");
    }

    /**
     * Lists gateway routes with server-side pagination.
     *
     * @param query Pagination parameters
     * @returns Paginated gateway routes
     */
    async listGatewayRoutesPaginated(
        query: PaginationQuery = {}
    ): Promise<PaginatedResponse<GatewayRouteSummary>> {
        return this.requestPaginated<GatewayRouteSummary>("GET", "/gateway/routes", query);
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
        const result = await this.request<ApplyResultPayload>("POST", "/gitops/webhook", payload);

        return {
            revision: result.revision,
            manifestName: result.manifestName,
            servicesCreated: result.diff.servicesToCreate,
            servicesUpdated: result.diff.servicesToUpdate,
            servicesDeleted: result.diff.servicesToRemove,
            instancesToCreate: result.diff.instancesToCreate,
            dispatch: result.dispatch
        };
    }

    /**
     * Lists recorded GitOps revisions.
     *
     * @returns Revision list wrapper
     */
    async listGitOpsRevisions(manifestName?: string): Promise<{ revisions: Array<Record<string, unknown>> }> {
        const query = manifestName ? `?manifestName=${encodeURIComponent(manifestName)}` : "";
        return this.request("GET", `/gitops/revisions${query}`);
    }

    /**
     * Rolls back to a recorded GitOps revision.
     *
     * @param revisionId Revision identifier
     * @returns Apply summary
     */
    async rollbackGitOps(revisionId: string): Promise<ApplyResponse> {
        const result = await this.request<ApplyResultPayload>(
            "POST",
            `/gitops/rollback/${encodeURIComponent(revisionId)}`
        );

        return {
            revision: result.revision,
            manifestName: result.manifestName,
            servicesCreated: result.diff.servicesToCreate,
            servicesUpdated: result.diff.servicesToUpdate,
            servicesDeleted: result.diff.servicesToRemove,
            instancesToCreate: result.diff.instancesToCreate,
            dispatch: result.dispatch
        };
    }

    /**
     * Returns NetBird topology summary.
     * 
     * @returns Topology summary
     */
    async getNetBirdTopology(): Promise<NetBirdTopology> {
        return this.request<NetBirdTopology>("GET", "/netbird/topology");
    }

    /**
     * Lists NetBird devices enrolled in the mesh.
     *
     * @returns NetBird device records
     */
    async listNetBirdDevices(): Promise<NetBirdDevice[]> {
        const response = await this.request<{ devices: NetBirdDevice[] }>("GET", "/netbird/devices");
        return response.devices;
    }

    /**
     * Lists NetBird groups managed by the control plane.
     *
     * @returns NetBird group records
     */
    async listNetBirdGroups(): Promise<NetBirdGroup[]> {
        const response = await this.request<{ groups: NetBirdGroup[] }>("GET", "/netbird/groups");
        return response.groups;
    }

    /**
     * Ensures a NetBird group exists by name.
     *
     * @param name Group name
     * @returns Ensured group record
     */
    async ensureNetBirdGroup(name: string): Promise<NetBirdGroup> {
        const response = await this.request<{ group: NetBirdGroup }>("POST", "/netbird/groups", { name });
        return response.group;
    }

    /**
     * Lists NetBird ACL rules.
     *
     * @returns NetBird ACL records
     */
    async listNetBirdAcls(): Promise<NetBirdAcl[]> {
        const response = await this.request<{ acls: NetBirdAcl[] }>("GET", "/netbird/acls");
        return response.acls;
    }

    /**
     * Returns Prometheus metrics in text exposition format.
     *
     * @returns Prometheus metrics document
     */
    async getPrometheusMetrics(): Promise<string> {
        return this.requestText("GET", "/metrics");
    }

    /**
     * Executes an instant PromQL query against the platform metrics API.
     *
     * @param query PromQL expression
     * @param time Optional evaluation timestamp (RFC3339 or unix)
     * @returns Instant query response
     */
    async queryMetrics(query: string, time?: string): Promise<PromQLInstantResponse> {
        const params = new URLSearchParams({ query });

        if (time) {
            params.set("time", time);
        }

        return this.request<PromQLInstantResponse>("GET", `/metrics/query?${params.toString()}`);
    }

    /**
     * Executes a range PromQL query against the platform metrics API.
     *
     * @param query PromQL expression
     * @param start Range start timestamp
     * @param end Range end timestamp
     * @param step Optional step width (e.g. 60s)
     * @returns Range query response
     */
    async queryMetricsRange(
        query: string,
        start: string,
        end: string,
        step = "60s"
    ): Promise<PromQLRangeResponse> {
        const params = new URLSearchParams({
            query,
            start,
            end,
            step
        });

        return this.request<PromQLRangeResponse>("GET", `/metrics/query_range?${params.toString()}`);
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
     * Lists container registry images.
     *
     * @returns Stored container image metadata
     */
    async listContainerRegistryImages(): Promise<ContainerRegistryImage[]> {
        const response = await this.request<{ images: ContainerRegistryImage[] }>("GET", "/cr/images");
        return response.images;
    }

    /**
     * Lists container registry images with server-side pagination.
     *
     * @param query Pagination parameters
     * @returns Paginated container registry images
     */
    async listContainerRegistryImagesPaginated(
        query: PaginationQuery = {}
    ): Promise<PaginatedResponse<ContainerRegistryImage>> {
        const suffix = this.buildPaginationQuery(query);
        const response = await this.request<PaginatedResponse<ContainerRegistryImage>>(
            "GET",
            `/cr/images${suffix}`
        );

        if (Array.isArray((response as unknown as { images?: ContainerRegistryImage[] }).images)) {
            const wrapped = response as unknown as { images: ContainerRegistryImage[] };
            return this.wrapArrayAsPaginated(wrapped.images, query);
        }

        return response;
    }

    /**
     * Returns metadata headers for a container registry image.
     *
     * @param name Image name
     * @param tag Image tag
     * @returns Image metadata derived from response headers
     */
    async headContainerRegistryImage(name: string, tag: string): Promise<ContainerRegistryImageHead> {
        const headers: Record<string, string> = {
            Accept: "application/json"
        };

        if (this.sessionToken) {
            headers["X-Platform-Session"] = this.sessionToken;
        }

        if (this.token) {
            headers.Authorization = `Bearer ${this.token}`;
        }

        const response = await this.fetchImpl(
            `${this.baseUrl}/cr/images/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`,
            {
                method: "HEAD",
                headers,
                credentials: this.credentials
            }
        );

        if (!response.ok) {
            throw new PlatformApiError(
                response.status,
                `Request failed with status ${response.status}`
            );
        }

        const digest = response.headers.get("Digest");
        const contentLength = response.headers.get("Content-Length");
        const contentType = response.headers.get("Content-Type");

        if (!digest || !contentLength || !contentType) {
            throw new PlatformApiError(
                response.status,
                "Container registry HEAD response is missing required headers."
            );
        }

        return {
            digest,
            sizeBytes: Number(contentLength),
            contentType
        };
    }

    /**
     * Deletes a container registry image.
     *
     * @param name Image name
     * @param tag Image tag
     * @returns Deletion confirmation payload
     */
    async deleteContainerRegistryImage(name: string, tag: string): Promise<ContainerRegistryImageDeleteResult> {
        return this.request<ContainerRegistryImageDeleteResult>(
            "DELETE",
            `/cr/images/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`
        );
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
        const headers = this.buildAuthHeaders(body !== undefined);

        const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
            method,
            headers,
            credentials: this.credentials,
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

    /**
     * Performs a paginated list request against the control plane.
     *
     * @param method HTTP method
     * @param path API path
     * @param query Pagination query parameters
     * @returns Paginated response envelope
     */
    private async requestPaginated<T>(
        method: string,
        path: string,
        query: PaginationQuery
    ): Promise<PaginatedResponse<T>> {
        const suffix = this.buildPaginationQuery(query);
        const response = await this.request<PaginatedResponse<T> | T[]>(method, `${path}${suffix}`);

        if (Array.isArray(response)) {
            return this.wrapArrayAsPaginated(response, query);
        }

        return response;
    }

    /**
     * Builds query string parameters for paginated list endpoints.
     *
     * @param query Pagination query parameters
     * @returns Query string including leading question mark when non-empty
     */
    private buildPaginationQuery(query: PaginationQuery): string {
        const params = new URLSearchParams();

        if (query.page !== undefined) {
            params.set("page", String(query.page));
        }
        if (query.limit !== undefined) {
            params.set("limit", String(query.limit));
        }
        if (query.cursor) {
            params.set("cursor", query.cursor);
        }
        if (query.sort) {
            params.set("sort", query.sort);
        }

        return params.size > 0 ? `?${params.toString()}` : "";
    }

    /**
     * Wraps a plain array response as a paginated envelope for legacy endpoints.
     *
     * @param items Full item list
     * @param query Requested pagination parameters
     * @returns Paginated response envelope
     */
    private wrapArrayAsPaginated<T>(items: T[], query: PaginationQuery): PaginatedResponse<T> {
        const limit = query.limit ?? 20;
        const page = query.page ?? 1;
        const start = (page - 1) * limit;
        const slice = items.slice(start, start + limit);

        return {
            items: slice,
            total: items.length,
            page,
            limit,
            hasMore: start + limit < items.length
        };
    }

    /**
     * Builds authorization headers for control plane requests.
     *
     * @param hasJsonBody Whether the request includes a JSON body
     * @returns Header map
     */
    private buildAuthHeaders(hasJsonBody: boolean): Record<string, string> {
        const headers: Record<string, string> = {
            Accept: "application/json"
        };

        if (hasJsonBody) {
            headers["Content-Type"] = "application/json";
        }

        if (this.sessionToken) {
            headers["X-Platform-Session"] = this.sessionToken;
        }

        if (this.token) {
            headers.Authorization = `Bearer ${this.token}`;
        }

        return headers;
    }

    /**
     * Performs an HTTP request and returns the raw response body as text.
     *
     * @param method HTTP method
     * @param path API path
     * @returns Raw response body
     */
    private async requestText(method: string, path: string): Promise<string> {
        const headers: Record<string, string> = {
            Accept: "text/plain, application/json"
        };

        if (this.sessionToken) {
            headers["X-Platform-Session"] = this.sessionToken;
        }

        if (this.token) {
            headers.Authorization = `Bearer ${this.token}`;
        }

        const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
            method,
            headers,
            credentials: this.credentials
        });

        const text = await response.text();

        if (!response.ok) {
            let message = `Request failed with status ${response.status}`;

            try {
                const parsed = text.length > 0 ? JSON.parse(text) as unknown : undefined;

                if (
                    typeof parsed === "object" &&
                    parsed !== null &&
                    "message" in parsed &&
                    typeof parsed.message === "string"
                ) {
                    message = parsed.message;
                }
            } catch {
                if (text.length > 0) {
                    message = text;
                }
            }

            throw new PlatformApiError(response.status, message);
        }

        return text;
    }
}

export { PlatformApiError } from "./PlatformApiError";
export type * from "./types";
