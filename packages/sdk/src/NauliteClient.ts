import { AdminUserMapper, type ControlPlaneAdminUser } from "./AdminUserMapper";
import { NAULITE_CSRF_HEADER } from "./CsrfConstants";
import { NauliteApiError } from "./NauliteApiError";
import type {
    AdminLoginInput,
    AdminLoginResponse,
    AdminSession,
    AdminUser,
    BffLoginResponse,
    BffSessionResponse,
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
    UpdateAdminUserInput,
    ExecResponse,
    GatewayRouteSummary,
    GitOpsWebhookPayload,
    IngressSummary,
    Instance,
    InstanceReconcileResult,
    LogRotationRun,
    LogRotationTask,
    FunctionRun,
    FunctionRunSummary,
    PaginatedResponse,
    PaginationQuery,
    PipelineEvent,
    PipelineRun,
    ListPipelineRunsQuery,
    LogsResponse,
    NotificationProviderStatus,
    NotificationProviderFilters,
    NotificationDestination,
    CreateNotificationDestinationInput,
    UpdateNotificationDestinationInput,
    NotificationTestResult,
    PipelineEventKind,
    NetBirdAcl,
    NodeProvision,
    NetBirdDevice,
    NetBirdGroup,
    NetBirdTopology,
    NauliteClientOptions,
    NauliteDiscovery,
    PromQLInstantResponse,
    PromQLRangeResponse,
    ProvisionNodeInput,
    RegistryResponse,
    ResolvedSecret,
    Secret,
    Service,
    ServiceReconcileResult,
    UpsertSecretInput,
    Volume
} from "./types";
import type { Node } from "./types";

/**
 * Returns a fetch implementation that remains callable when stored on a class field.
 * Browser fetch throws "Illegal invocation" when extracted from window without binding.
 *
 * @param fetchImpl Optional custom fetch implementation
 * @returns Callable fetch function
 */
function resolveFetchImpl(fetchImpl?: typeof fetch): typeof fetch {
    if (fetchImpl) {
        return fetchImpl;
    }

    return globalThis.fetch.bind(globalThis);
}

/**
 * Normalizes control plane base URLs from client options.
 *
 * @param options Client configuration
 * @returns Non-empty list of base URLs
 */
function normalizeControlPlaneInstances(options: NauliteClientOptions): string[] {
    const rawInstances = options.controlPlaneInstances
        ?? (options.baseUrl ? [options.baseUrl] : ["http://localhost:8080"]);

    const instances = rawInstances
        .map((url) => url.trim().replace(/\/$/, ""))
        .filter((url) => url.length > 0);

    return instances.length > 0 ? instances : ["http://localhost:8080"];
}

/**
 * Typed HTTP client for all control plane REST routes.
 */
export class NauliteClient {
    private readonly baseUrl: string;
    private readonly token?: string;
    private readonly sessionToken?: string;
    private readonly csrfToken?: string;
    private readonly credentials?: "omit" | "same-origin" | "include";
    private readonly fetchImpl: typeof fetch;
    private readonly controlPlaneInstances: string[];

    /**
     * Creates a platform API client.
     * 
     * @param options Client configuration
     */
    constructor(options: NauliteClientOptions) {
        const instances = normalizeControlPlaneInstances(options);
        this.baseUrl = instances[0];
        this.controlPlaneInstances = instances;
        this.token = options.token;
        this.sessionToken = options.sessionToken;
        this.csrfToken = options.csrfToken;
        this.credentials = options.credentials;
        this.fetchImpl = resolveFetchImpl(options.fetchImpl);
    }

    /**
     * Returns a client clone that forwards the given session token to the control plane.
     *
     * @param sessionToken Opaque platform session token
     * @returns Cloned client with session forwarding enabled
     */
    withSession(sessionToken: string): NauliteClient {
        return new NauliteClient({
            baseUrl: this.baseUrl,
            token: this.token,
            sessionToken,
            csrfToken: this.csrfToken,
            credentials: this.credentials,
            fetchImpl: this.fetchImpl,
            controlPlaneInstances: this.controlPlaneInstances
        });
    }

    /**
     * Returns a client clone that sends the CSRF header on mutating BFF requests.
     *
     * @param csrfToken CSRF token from login or session recovery
     * @returns Cloned client with CSRF forwarding enabled
     */
    withCsrf(csrfToken: string): NauliteClient {
        return new NauliteClient({
            baseUrl: this.baseUrl,
            token: this.token,
            sessionToken: this.sessionToken,
            csrfToken,
            credentials: this.credentials,
            fetchImpl: this.fetchImpl,
            controlPlaneInstances: this.controlPlaneInstances
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
    async login(input: AdminLoginInput): Promise<BffLoginResponse> {
        return this.request<BffLoginResponse>("POST", "/auth/login", input);
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
    async getSession(): Promise<BffSessionResponse> {
        return this.request<BffSessionResponse>("GET", "/auth/me");
    }

    /**
     * Authenticates an admin user and returns a session token.
     *
     * @param input Login credentials
     * @returns Session token and user profile
     */
    async adminLogin(input: AdminLoginInput): Promise<AdminLoginResponse> {
        const response = await this.request<{
            sessionToken: string;
            expiresAt?: string;
            user: ControlPlaneAdminUser;
        }>("POST", "/admin/login", {
            email: AdminUserMapper.emailToUsername(input.email),
            password: input.password
        });

        return {
            sessionToken: response.sessionToken,
            user: AdminUserMapper.toSdkUser(response.user)
        };
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
        const response = await this.request<{ user: ControlPlaneAdminUser }>("GET", "/admin/me");
        return {
            user: AdminUserMapper.toSdkUser(response.user)
        };
    }

    /**
     * Lists admin users (admin role required).
     *
     * @returns Admin user records
     */
    async listAdminUsers(): Promise<AdminUser[]> {
        const users = await this.request<ControlPlaneAdminUser[]>("GET", "/admin/users");
        return users.map((user) => AdminUserMapper.toSdkUser(user));
    }

    /**
     * Creates a new admin user (admin role required).
     *
     * @param input User creation payload
     * @returns Created admin user
     */
    async createAdminUser(input: CreateAdminUserInput): Promise<AdminUser> {
        const user = await this.request<ControlPlaneAdminUser>("POST", "/admin/users", {
            email: AdminUserMapper.emailToUsername(input.email),
            password: input.password,
            role: input.role
        });

        return AdminUserMapper.toSdkUser(user);
    }

    /**
     * Disables an admin user by identifier (admin role required).
     *
     * @param userId Admin user identifier
     * @param input Optional disable reason
     * @returns Updated admin user
     */
    async disableAdminUser(userId: string, input: DisableAdminUserInput = {}): Promise<AdminUser> {
        const user = await this.request<ControlPlaneAdminUser>(
            "POST",
            `/admin/users/${encodeURIComponent(userId)}/disable`,
            input
        );

        return AdminUserMapper.toSdkUser(user);
    }

    /**
     * Returns a single admin user by identifier (admin role required).
     *
     * @param userId Admin user identifier
     * @returns Admin user record
     */
    async getAdminUser(userId: string): Promise<AdminUser> {
        const user = await this.request<ControlPlaneAdminUser>(
            "GET",
            `/admin/users/${encodeURIComponent(userId)}`
        );

        return AdminUserMapper.toSdkUser(user);
    }

    /**
     * Updates an admin user (admin role required).
     *
     * @param userId Admin user identifier
     * @param input Update payload
     * @returns Updated admin user
     */
    async updateAdminUser(userId: string, input: UpdateAdminUserInput): Promise<AdminUser> {
        const payload: UpdateAdminUserInput = {};

        if (input.role) {
            payload.role = input.role;
        }

        if (input.password) {
            payload.password = input.password;
        }

        if (input.email) {
            payload.email = AdminUserMapper.emailToUsername(input.email);
        }

        const user = await this.request<ControlPlaneAdminUser>(
            "PATCH",
            `/admin/users/${encodeURIComponent(userId)}`,
            payload
        );

        return AdminUserMapper.toSdkUser(user);
    }

    /**
     * Re-enables a disabled admin user (admin role required).
     *
     * @param userId Admin user identifier
     * @returns Updated admin user
     */
    async enableAdminUser(userId: string): Promise<AdminUser> {
        const user = await this.request<ControlPlaneAdminUser>(
            "POST",
            `/admin/users/${encodeURIComponent(userId)}/enable`
        );

        return AdminUserMapper.toSdkUser(user);
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
     * Returns decrypted secret values for operator review.
     *
     * @param secretName Secret name
     * @returns Resolved secret payload
     */
    async revealSecret(secretName: string): Promise<ResolvedSecret> {
        const params = new URLSearchParams({ name: secretName });
        return this.request<ResolvedSecret>("GET", `/secrets/reveal?${params.toString()}`);
    }

    /**
     * Lists notification destinations configured through the admin panel.
     *
     * @returns Notification destination list
     */
    async listNotificationDestinations(): Promise<{ destinations: NotificationDestination[] }> {
        return this.request<{ destinations: NotificationDestination[] }>("GET", "/notifications/destinations");
    }

    /**
     * Creates a notification destination.
     *
     * @param input Destination payload
     * @returns Created destination
     */
    async createNotificationDestination(input: CreateNotificationDestinationInput): Promise<NotificationDestination> {
        return this.request<NotificationDestination>("POST", "/notifications/destinations", input);
    }

    /**
     * Returns a notification destination by identifier.
     *
     * @param destinationId Destination identifier
     * @returns Destination payload
     */
    async getNotificationDestination(destinationId: string): Promise<NotificationDestination> {
        return this.request<NotificationDestination>(
            "GET",
            `/notifications/destinations/${encodeURIComponent(destinationId)}`
        );
    }

    /**
     * Updates a notification destination.
     *
     * @param destinationId Destination identifier
     * @param input Partial destination payload
     * @returns Updated destination
     */
    async updateNotificationDestination(
        destinationId: string,
        input: UpdateNotificationDestinationInput
    ): Promise<NotificationDestination> {
        return this.request<NotificationDestination>(
            "PATCH",
            `/notifications/destinations/${encodeURIComponent(destinationId)}`,
            input
        );
    }

    /**
     * Deletes a notification destination.
     *
     * @param destinationId Destination identifier
     * @returns Deletion result
     */
    async deleteNotificationDestination(destinationId: string): Promise<{ id: string; deleted: true }> {
        return this.request<{ id: string; deleted: true }>(
            "DELETE",
            `/notifications/destinations/${encodeURIComponent(destinationId)}`
        );
    }

    /**
     * Sends a test notification to a single destination.
     *
     * @param destinationId Destination identifier
     * @returns Delivery result
     */
    async testNotificationDestination(destinationId: string): Promise<NotificationTestResult> {
        return this.request<NotificationTestResult>(
            "POST",
            `/notifications/destinations/${encodeURIComponent(destinationId)}/test`
        );
    }

    /**
     * Lists registered notification providers and their environment status.
     *
     * @returns Notification provider status list
     */
    async listNotificationProviders(): Promise<{ providers: NotificationProviderStatus[] }> {
        return this.request<{ providers: NotificationProviderStatus[] }>("GET", "/notifications/providers");
    }

    /**
     * Sends a test notification to every enabled destination.
     *
     * @returns Per-destination delivery results
     */
    async testNotificationProviders(): Promise<{ destinations: NotificationTestResult[] }> {
        return this.request<{ destinations: NotificationTestResult[] }>("POST", "/notifications/test");
    }

    /**
     * Returns allowed pipeline event kinds for a notification provider.
     *
     * @param providerId Notification provider identifier
     * @returns Provider filter configuration
     */
    async getNotificationProviderFilters(providerId: string): Promise<NotificationProviderFilters> {
        return this.request<NotificationProviderFilters>(
            "GET",
            `/notifications/providers/${encodeURIComponent(providerId)}/filters`
        );
    }

    /**
     * Updates allowed pipeline event kinds for a notification provider.
     *
     * @param providerId Notification provider identifier
     * @param allowedKinds Pipeline event kinds to deliver
     * @returns Updated provider filter configuration
     */
    async updateNotificationProviderFilters(
        providerId: string,
        allowedKinds: PipelineEventKind[]
    ): Promise<NotificationProviderFilters> {
        return this.request<NotificationProviderFilters>(
            "PATCH",
            `/notifications/providers/${encodeURIComponent(providerId)}/filters`,
            { allowedKinds }
        );
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
     * Manually re-dispatches a pending or failed instance to its agent.
     *
     * @param instanceId Instance identifier
     * @returns Reconcile outcome
     */
    async reconcileInstance(instanceId: string): Promise<InstanceReconcileResult> {
        return this.request<InstanceReconcileResult>(
            "POST",
            `/instances/${encodeURIComponent(instanceId)}/reconcile`
        );
    }

    /**
     * Manually re-dispatches pending or failed instances for a service.
     *
     * @param serviceName Service name
     * @returns Per-instance reconcile outcomes
     */
    async reconcileService(serviceName: string): Promise<ServiceReconcileResult> {
        return this.request<ServiceReconcileResult>(
            "POST",
            `/services/${encodeURIComponent(serviceName)}/reconcile`
        );
    }

    /**
     * Executes a command inside an instance (non-interactive).
     * For interactive sessions with stdin or TTY, use the WebSocket route
     * `GET /instances/:id/exec/ws` instead.
     *
     * @param instanceId Instance identifier
     * @param command Command argv array
     * @param options Optional exec flags (stdin/tty are rejected by POST; use WebSocket for those)
     * @returns Exec result
     */
    async exec(
        instanceId: string,
        command: string[],
        options: { stdin?: boolean; tty?: boolean } = {}
    ): Promise<ExecResponse> {
        return this.request<ExecResponse>(
            "POST",
            `/instances/${encodeURIComponent(instanceId)}/exec`,
            { command, ...options }
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
            headers["X-Naulite-Session"] = this.sessionToken;
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
     * @throws {NauliteApiError} {@link NauliteApiError}
     */
    async *streamRunEvents(runId: string): AsyncGenerator<PipelineEvent> {
        const headers: Record<string, string> = {
            Accept: "text/event-stream"
        };

        if (this.sessionToken) {
            headers["X-Naulite-Session"] = this.sessionToken;
        }

        if (this.token) {
            headers.Authorization = `Bearer ${this.token}`;
        }

        const response = await this.fetchImpl(
            `${this.baseUrl}/runs/${encodeURIComponent(runId)}/stream`,
            { headers, credentials: this.credentials }
        );

        if (!response.ok || !response.body) {
            throw new NauliteApiError(response.status, `SSE stream failed with status ${response.status}`);
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

    async invokeFunction(
        name: string,
        input: { payload?: unknown; environment?: Record<string, string> } = {}
    ): Promise<{ runId: string }> {
        return this.request<{ runId: string }>(
            "POST",
            `/functions/${encodeURIComponent(name)}/invoke`,
            input
        );
    }

    async listFunctionRuns(
        name: string,
        query: PaginationQuery = {}
    ): Promise<PaginatedResponse<FunctionRunSummary>> {
        return this.requestPaginated<FunctionRunSummary>(
            "GET",
            `/functions/${encodeURIComponent(name)}/runs`,
            query
        );
    }

    async getFunctionRun(name: string, runId: string): Promise<FunctionRun> {
        return this.request<FunctionRun>(
            "GET",
            `/functions/${encodeURIComponent(name)}/runs/${encodeURIComponent(runId)}`
        );
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
     * @param manifestName Optional manifest name filter
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
    async getNauliteDiscovery(): Promise<NauliteDiscovery> {
        return this.request<NauliteDiscovery>("GET", "/.well-known/naulite");
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
     * @throws {NauliteApiError} {@link NauliteApiError}
     */
    async headContainerRegistryImage(name: string, tag: string): Promise<ContainerRegistryImageHead> {
        const headers: Record<string, string> = {
            Accept: "application/json"
        };

        if (this.sessionToken) {
            headers["X-Naulite-Session"] = this.sessionToken;
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
            throw new NauliteApiError(
                response.status,
                `Request failed with status ${response.status}`
            );
        }

        const digest = response.headers.get("Digest");
        const contentLength = response.headers.get("Content-Length");
        const contentType = response.headers.get("Content-Type");

        if (!digest || !contentLength || !contentType) {
            throw new NauliteApiError(
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
        return this.requestOnBaseUrl<T>(this.baseUrl, method, path, body, true);
    }

    /**
     * Performs an HTTP request against a specific control plane base URL.
     *
     * @param baseUrl Control plane base URL
     * @param method HTTP method
     * @param path API path
     * @param body Optional JSON body
     * @param allowLeaderRetry Whether a follower 503 may be retried on the leader
     * @returns Parsed JSON response
     * @throws {unknown}
     */
    private async requestOnBaseUrl<T>(
        baseUrl: string,
        method: string,
        path: string,
        body: unknown,
        allowLeaderRetry: boolean
    ): Promise<T> {
        const headers = this.buildAuthHeaders(method, body !== undefined);

        const response = await this.fetchImpl(`${baseUrl}${path}`, {
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

            const error = new NauliteApiError(response.status, message, parsed);

            if (allowLeaderRetry && error.status === 503 && error.code === "not_leader") {
                for (const peerUrl of this.controlPlaneInstances) {
                    if (peerUrl === baseUrl) {
                        continue;
                    }

                    return this.requestOnBaseUrl<T>(peerUrl, method, path, body, false);
                }
            }

            throw error;
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
     * @param method HTTP method for the request
     * @param hasJsonBody Whether the request includes a JSON body
     * @returns Header map
     */
    private buildAuthHeaders(method: string, hasJsonBody: boolean): Record<string, string> {
        const headers: Record<string, string> = {
            Accept: "application/json"
        };

        if (hasJsonBody) {
            headers["Content-Type"] = "application/json";
        }

        if (this.sessionToken) {
            headers["X-Naulite-Session"] = this.sessionToken;
        }

        if (this.token) {
            headers.Authorization = `Bearer ${this.token}`;
        }

        if (
            this.csrfToken &&
            this.credentials === "include" &&
            !this.token &&
            this.requiresCsrfHeader(method)
        ) {
            headers[NAULITE_CSRF_HEADER] = this.csrfToken;
        }

        return headers;
    }

    /**
     * Returns whether the HTTP method requires CSRF protection on the BFF.
     *
     * @param method HTTP method
     * @returns True for mutating methods
     */
    private requiresCsrfHeader(method: string): boolean {
        const normalized = method.toUpperCase();
        return normalized !== "GET" && normalized !== "HEAD" && normalized !== "OPTIONS";
    }

    /**
     * Performs an HTTP request and returns the raw response body as text.
     *
     * @param method HTTP method
     * @param path API path
     * @returns Raw response body
     * @throws {NauliteApiError} {@link NauliteApiError}
     */
    private async requestText(method: string, path: string): Promise<string> {
        const headers: Record<string, string> = {
            Accept: "text/plain, application/json"
        };

        if (this.sessionToken) {
            headers["X-Naulite-Session"] = this.sessionToken;
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

            throw new NauliteApiError(response.status, message);
        }

        return text;
    }
}

export { NauliteApiError } from "./NauliteApiError";
export type * from "./types";
