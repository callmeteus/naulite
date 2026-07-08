import { execFile } from "node:child_process";
import https from "node:https";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Cluster status payload from `/cluster/status`.
 */
export interface ClusterStatusResponse {
    leaderId: string;
    isLeader: boolean;
    controlPlaneId: string;
    summary?: {
        runningInstances: number;
        instances: number;
    };
}

/**
 * Manages the local Docker-based multi-node test cluster.
 */
export class LocalTestCluster {
    private static readonly composeFile = path.resolve(
        process.cwd(),
        "tests/fixtures/docker-compose.test-cluster.yml"
    );

    private static readonly projectName = "naulite-test-cluster";

    private static readonly controlPlanePorts: Record<string, number> = {
        "cp-1": 18_080,
        "cp-2": 18_081
    };

    private static readonly instanceComposeServices: Record<string, string> = {
        "cp-1": "control-plane-1",
        "cp-2": "control-plane-2"
    };

    /**
     * Starts the docker compose test cluster.
     * 
     * @returns Nothing.
     */
    static async start(): Promise<void> {
        await this.ensureStopped();

        const useMock = this.usesTraefikMock();
        const traefikProfile = useMock ? "mock" : "real";
        const traefikDynamicConfigUrl = useMock
            ? "http://traefik-mock:8099/naulite/dynamic-config"
            : "http://traefik-dynamic-config:8099/naulite/dynamic-config";

        await execFileAsync(
            "docker",
            [
                "compose",
                "-f",
                this.composeFile,
                "-p",
                this.projectName,
                "--profile",
                traefikProfile,
                "up",
                "-d",
                "--build",
                "--remove-orphans"
            ],
            {
                cwd: process.cwd(),
                env: {
                    ...process.env,
                    TRAEFIK_DYNAMIC_CONFIG_URL: traefikDynamicConfigUrl
                }
            }
        );
    }

    /**
     * Stops and removes the docker compose test cluster.
     * 
     * @returns Nothing.
     */
    static async stop(): Promise<void> {
        await this.ensureStopped();
    }

    /**
     * Tears down the compose project including profile-specific services and orphans.
     *
     * @returns Nothing.
     */
    private static async ensureStopped(): Promise<void> {
        await this.cleanupApplyContainers();

        try {
            await execFileAsync(
                "docker",
                [
                    "compose",
                    "-f",
                    this.composeFile,
                    "-p",
                    this.projectName,
                    "--profile",
                    "mock",
                    "--profile",
                    "real",
                    "down",
                    "-v",
                    "--remove-orphans"
                ],
                { cwd: process.cwd() }
            );
        } catch {
            // Best-effort cleanup before start or after tests.
        }
    }

    /**
     * Removes containers created by apply tests on the shared Docker host.
     *
     * @returns Nothing.
     */
    private static async cleanupApplyContainers(): Promise<void> {
        try {
            const { stdout } = await execFileAsync(
                "docker",
                ["ps", "-aq", "--filter", "name=minimal-"],
                { cwd: process.cwd() }
            );

            const containerIds = stdout
                .split(/\s+/)
                .map((entry) => entry.trim())
                .filter((entry) => entry.length > 0);

            if (containerIds.length === 0) {
                return;
            }

            await execFileAsync("docker", ["rm", "-f", ...containerIds], { cwd: process.cwd() });
        } catch {
            // Best-effort cleanup for leftover workload containers.
        }
    }

    /**
     * Restarts the docker compose test cluster.
     * 
     * @returns Nothing.
     */
    static async reset(): Promise<void> {
        await this.stop();
        await this.start();
    }

    /**
     * Waits until the primary control plane responds on `/health`.
     * 
     * @param timeoutMs Maximum wait time in milliseconds
     * @returns Nothing.
     */
    static async waitHealthy(timeoutMs = 300_000): Promise<void> {
        const url = this.getControlPlaneUrl();
        const deadline = Date.now() + timeoutMs;

        await this.waitForControlPlaneLive(Math.max(30_000, deadline - Date.now()));

        while (Date.now() < deadline) {
            try {
                const response = await fetch(`${url}/health`);

                if (response.ok) {
                    const body = await response.json() as { status?: string };

                    if (body.status === "healthy") {
                        return;
                    }
                }
            } catch {
                // Retry until timeout.
            }

            await new Promise((resolve) => {
                setTimeout(resolve, 2_000);
            });
        }

        throw new Error(`Control plane did not become healthy at ${url}`);
    }

    /**
     * Waits until the default worker agent responds on `/health`.
     *
     * @param nodeId Simulated node identifier
     * @param timeoutMs Maximum wait time in milliseconds
     * @returns Nothing.
     */
    static async waitForAgentHealthy(nodeId = "node-a", timeoutMs = 120_000): Promise<void> {
        const url = `${this.getAgentUrl(nodeId)}/health`;
        const startedAt = Date.now();

        while (Date.now() - startedAt < timeoutMs) {
            try {
                const response = await fetch(url);

                if (response.ok) {
                    const body = await response.json() as { status?: string };

                    if (body.status === "ok") {
                        return;
                    }
                }
            } catch {
                // Retry until timeout.
            }

            await new Promise((resolve) => {
                setTimeout(resolve, 2_000);
            });
        }

        throw new Error(`Agent did not become healthy at ${url}`);
    }

    /**
     * Waits until the primary control plane responds on `/health/live`.
     *
     * @param timeoutMs Maximum wait time in milliseconds
     * @returns Nothing.
     */
    static async waitForControlPlaneLive(timeoutMs = 120_000): Promise<void> {
        const url = this.getControlPlaneUrl();
        const startedAt = Date.now();

        while (Date.now() - startedAt < timeoutMs) {
            try {
                const response = await fetch(`${url}/health/live`);

                if (response.ok) {
                    return;
                }
            } catch {
                // Retry until timeout.
            }

            await new Promise((resolve) => {
                setTimeout(resolve, 2_000);
            });
        }

        throw new Error(`Control plane did not become reachable at ${url}`);
    }

    /**
     * Returns whether CI or the caller requires Docker to be available.
     *
     * @returns `true` when `REQUIRE_DOCKER=true`
     */
    static isDockerRequired(): boolean {
        return process.env.REQUIRE_DOCKER === "true";
    }

    /**
     * Fails fast when Docker is required but the daemon is unreachable.
     *
     * @param available Result of {@link isDockerAvailable}
     * @returns Nothing.
     */
    static assertDockerAvailable(available: boolean): void {
        if (!available && this.isDockerRequired()) {
            throw new Error(
                "Docker is required (REQUIRE_DOCKER=true) but the daemon is not reachable. " +
                "Run `docker version` on the host to diagnose."
            );
        }
    }

    /**
     * Re-throws bootstrap errors when Docker is required instead of skipping tests.
     *
     * @param err Error raised while starting or probing the test cluster
     * @returns Nothing.
     */
    static rethrowIfDockerRequired(err: unknown): void {
        if (this.isDockerRequired()) {
            throw err;
        }
    }

    /**
     * Returns whether Docker appears to be available on the host.
     * 
     * @returns `true` when `docker version` succeeds
     */
    static async isDockerAvailable(): Promise<boolean> {
        try {
            await execFileAsync("docker", ["version"]);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Returns the primary control plane base URL.
     * 
     * @returns Control plane URL
     */
    static getControlPlaneUrl(): string {
        return process.env.NAULITE_CP_URL ?? "http://localhost:18080";
    }

    /**
     * Returns whether the test cluster should use traefik-mock instead of real Traefik.
     *
     * @returns `true` when `TRAEFIK_USE_MOCK=true`
     */
    static usesTraefikMock(): boolean {
        return process.env.TRAEFIK_USE_MOCK === "true";
    }

    /**
     * Returns the host-mapped Traefik HTTP entrypoint URL for ingress e2e checks.
     *
     * @returns Traefik web entrypoint URL
     */
    static getTraefikHttpUrl(): string {
        return process.env.TRAEFIK_HTTP_URL ?? "http://127.0.0.1:19080";
    }

    /**
     * Returns the host-mapped Traefik HTTPS entrypoint URL for TLS ingress e2e checks.
     *
     * @returns Traefik websecure entrypoint URL
     */
    static getTraefikHttpsUrl(): string {
        return process.env.TRAEFIK_HTTPS_URL ?? "https://127.0.0.1:19443";
    }

    /**
     * Performs an HTTPS request against Traefik ignoring self-signed certificate errors.
     *
     * @param requestPath Request path on the Traefik HTTPS entrypoint
     * @param host Host header value
     * @returns Minimal HTTP response wrapper
     */
    static fetchTraefikHttps(
        requestPath: string,
        host: string
    ): Promise<{ ok: boolean; status: number; text: () => Promise<string> }> {
        const url = new URL(`${this.getTraefikHttpsUrl()}${requestPath}`);

        return new Promise((resolve, reject) => {
            const request = https.request({
                hostname: url.hostname,
                port: url.port || 443,
                path: `${url.pathname}${url.search}`,
                method: "GET",
                headers: {
                    Host: host
                },
                rejectUnauthorized: false
            }, (response) => {
                const chunks: Buffer[] = [];
                response.on("data", (chunk) => {
                    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
                });
                response.on("end", () => {
                    const body = Buffer.concat(chunks).toString("utf8");
                    const status = response.statusCode ?? 500;
                    resolve({
                        ok: status >= 200 && status < 300,
                        status,
                        text: async () => body
                    });
                });
            });

            request.on("error", reject);
            request.end();
        });
    }

    /**
     * Waits until the public ingress route serves HTTPS through Traefik.
     *
     * @param host Ingress host header value
     * @param timeoutMs Maximum wait time in milliseconds
     * @returns Nothing.
     */
    static async waitForTraefikIngressTls(host: string, timeoutMs = 120_000): Promise<void> {
        const traefikUrl = this.getTraefikHttpsUrl();
        const controlPlaneUrl = this.getControlPlaneUrl();
        const startedAt = Date.now();

        while (Date.now() - startedAt < timeoutMs) {
            try {
                const instancesResponse = await fetch(`${controlPlaneUrl}/instances`);
                if (instancesResponse.ok) {
                    const instances = await instancesResponse.json() as Array<{
                        serviceName: string;
                        status: string;
                    }>;
                    const running = instances.some((instance) => {
                        return instance.serviceName === "web" && instance.status === "running";
                    });

                    if (running) {
                        const ingressResponse = await this.fetchTraefikHttps("/", host);

                        if (ingressResponse.ok) {
                            return;
                        }
                    }
                }
            } catch {
                // Retry until timeout.
            }

            await new Promise((resolve) => {
                setTimeout(resolve, 2_000);
            });
        }

        throw new Error(`TLS ingress for host ${host} did not become reachable through Traefik at ${traefikUrl}`);
    }

    /**
     * Returns the host-mapped dynamic configuration store URL for diagnostics.
     *
     * @returns Dynamic config store base URL
     */
    static getTraefikDynamicConfigStoreUrl(): string {
        return process.env.TRAEFIK_DYNAMIC_CONFIG_STORE_URL ?? "http://127.0.0.1:19099";
    }

    /**
     * Returns the control plane base URL for a host port.
     *
     * @param port Published control plane host port
     * @returns Control plane URL
     */
    static getControlPlaneUrlForPort(port: number): string {
        return `http://127.0.0.1:${port}`;
    }

    /**
     * Returns the traefik-mock base URL exposed by the test cluster.
     *
     * @returns Traefik mock URL
     */
    static getTraefikMockUrl(): string {
        return "http://127.0.0.1:19099";
    }

    /**
     * Fetches cluster status from a control plane replica port.
     *
     * @param port Published control plane host port
     * @returns Cluster status payload
     */
    static async fetchClusterStatus(port: number): Promise<ClusterStatusResponse> {
        const response = await fetch(`${this.getControlPlaneUrlForPort(port)}/cluster/status`);

        if (!response.ok) {
            throw new Error(`Cluster status request failed on port ${port}: ${response.status}`);
        }

        return response.json() as Promise<ClusterStatusResponse>;
    }

    /**
     * Returns the host port of the elected control plane leader.
     *
     * @returns Leader host port
     */
    static async getLeaderPort(): Promise<number> {
        for (const port of Object.values(this.controlPlanePorts)) {
            try {
                const status = await this.fetchClusterStatus(port);

                if (status.isLeader) {
                    return port;
                }
            } catch {
                // Try the other replica.
            }
        }

        throw new Error("No control plane leader is currently elected.");
    }

    /**
     * Returns the base URL of the elected control plane leader.
     *
     * @returns Leader control plane URL
     */
    static async getLeaderControlPlaneUrl(): Promise<string> {
        const leaderPort = await this.getLeaderPort();
        return this.getControlPlaneUrlForPort(leaderPort);
    }

    /**
     * Posts a manifest YAML payload to `/apply` on the elected control plane leader.
     *
     * @param manifestYaml Compose manifest body
     * @param options Optional apply request fields (for example `buildContextRoot`)
     * @returns Raw fetch response from the leader
     */
    static async applyManifest(
        manifestYaml: string,
        options?: {
            buildContextRoot?: string;
            headers?: Record<string, string>;
        }
    ): Promise<Response> {
        const leaderUrl = await this.getLeaderControlPlaneUrl();

        return fetch(`${leaderUrl}/apply`, {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                ...(options?.headers ?? {})
            },
            body: JSON.stringify({
                manifestYaml,
                ...(options?.buildContextRoot ? { buildContextRoot: options.buildContextRoot } : {})
            })
        });
    }

    /**
     * Fetches a control plane API path on the elected leader.
     *
     * @param path API path beginning with `/`
     * @param init Optional fetch init (method, body, headers)
     * @returns Raw fetch response from the leader
     */
    static async fetchLeader(path: string, init?: RequestInit): Promise<Response> {
        const leaderUrl = await this.getLeaderControlPlaneUrl();
        const normalizedPath = path.startsWith("/") ? path : `/${path}`;

        return fetch(`${leaderUrl}${normalizedPath}`, init);
    }

    /**
     * Returns the host port of the non-leader control plane replica.
     *
     * @returns Follower host port
     */
    static async getFollowerPort(): Promise<number> {
        const leaderPort = await this.getLeaderPort();
        return leaderPort === this.controlPlanePorts["cp-1"]
            ? this.controlPlanePorts["cp-2"]
            : this.controlPlanePorts["cp-1"];
    }

    /**
     * Stops a control plane container by instance id (for example `cp-1`).
     *
     * @param instanceId Control plane instance id (`cp-1` or `cp-2`)
     * @returns Nothing.
     */
    static async stopContainer(instanceId: string): Promise<void> {
        const service = this.instanceComposeServices[instanceId];

        if (!service) {
            throw new Error(`Unknown control plane instance id: ${instanceId}`);
        }

        await execFileAsync(
            "docker",
            [
                "compose",
                "-f",
                this.composeFile,
                "-p",
                this.projectName,
                "stop",
                service
            ],
            { cwd: process.cwd() }
        );
    }

    /**
     * Pauses a control plane container by instance id (for example `cp-1`).
     *
     * @param instanceId Control plane instance id (`cp-1` or `cp-2`)
     * @returns Nothing.
     */
    static async pauseContainer(instanceId: string): Promise<void> {
        const service = this.instanceComposeServices[instanceId];

        if (!service) {
            throw new Error(`Unknown control plane instance id: ${instanceId}`);
        }

        await execFileAsync(
            "docker",
            [
                "compose",
                "-f",
                this.composeFile,
                "-p",
                this.projectName,
                "pause",
                service
            ],
            { cwd: process.cwd() }
        );
    }

    /**
     * Unpauses a paused control plane container by instance id.
     *
     * @param instanceId Control plane instance id (`cp-1` or `cp-2`)
     * @returns Nothing.
     */
    static async unpauseContainer(instanceId: string): Promise<void> {
        const service = this.instanceComposeServices[instanceId];

        if (!service) {
            throw new Error(`Unknown control plane instance id: ${instanceId}`);
        }

        await execFileAsync(
            "docker",
            [
                "compose",
                "-f",
                this.composeFile,
                "-p",
                this.projectName,
                "unpause",
                service
            ],
            { cwd: process.cwd() }
        );
    }

    /**
     * Waits until a new leader is elected on a surviving control plane replica.
     *
     * @param timeoutMs Maximum wait time in milliseconds
     * @param excludedInstanceId Optional dead instance id to ignore while polling
     * @returns Host port of the newly elected leader
     */
    static async waitForNewLeader(
        timeoutMs = 90_000,
        excludedInstanceId?: string
    ): Promise<number> {
        const startedAt = Date.now();

        while (Date.now() - startedAt < timeoutMs) {
            for (const [instanceId, port] of Object.entries(this.controlPlanePorts)) {
                if (excludedInstanceId && instanceId === excludedInstanceId) {
                    continue;
                }

                try {
                    const status = await this.fetchClusterStatus(port);

                    if (status.isLeader) {
                        return port;
                    }
                } catch {
                    // Retry until timeout.
                }
            }

            await new Promise((resolve) => {
                setTimeout(resolve, 2_000);
            });
        }

        throw new Error("A new control plane leader was not elected before timeout.");
    }

    /**
     * Returns the agent base URL for a simulated node id.
     * 
     * @param nodeId Simulated node identifier
     * @returns Agent URL
     */
    static getAgentUrl(nodeId: string): string {
        const ports: Record<string, string> = {
            "node-a": "http://localhost:19003",
            "agent-worker": "http://localhost:19003",
            "agent-builder": "http://localhost:19001",
            "agent-1": "http://localhost:19001"
        };

        return ports[nodeId] ?? "http://localhost:19003";
    }
}
