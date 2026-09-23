import type { Instance, Node } from "@naulite/shared";

import { Logger } from "../Logger";
import type { ControlPlaneStore } from "../database/ControlPlaneStore";
import { NodeAgentUrlResolver } from "./NodeAgentUrlResolver";

const logAgentProxy = Logger.create("agent-proxy");

/**
 * Default timeout for outbound agent HTTP requests when env is unset.
 */
const DEFAULT_AGENT_FETCH_TIMEOUT_MS = 15_000;

/**
 * Resolves the timeout used for outbound agent HTTP requests.
 *
 * @returns Timeout in milliseconds
 */
function resolveAgentFetchTimeoutMs(): number {
    const configured = Number(process.env.NAULITE_AGENT_FETCH_TIMEOUT_MS ?? DEFAULT_AGENT_FETCH_TIMEOUT_MS);

    if (!Number.isFinite(configured) || configured <= 0) {
        return DEFAULT_AGENT_FETCH_TIMEOUT_MS;
    }

    return configured;
}

/**
 * Performs a fetch against a node agent with a bounded wait time.
 *
 * @param url Absolute agent URL
 * @param init Optional fetch init options
 * @returns Agent HTTP response
 * @throws {AgentProxyError} {@link AgentProxyError}
 */
async function fetchAgent(
    url: string,
    init?: RequestInit
): Promise<Response> {
    const controller = new AbortController();
    const timeoutMs = resolveAgentFetchTimeoutMs();
    const timer = setTimeout(() => {
        controller.abort();
    }, timeoutMs);

    if (init?.signal) {
        init.signal.addEventListener("abort", () => {
            controller.abort();
        }, { once: true });
    }

    try {
        const fetchUrl = NodeAgentUrlResolver.resolveControlPlaneFetchUrl(url);

        return await fetch(fetchUrl, {
            ...init,
            signal: controller.signal
        });
    } catch (err) {
        let proxyError: AgentProxyError;

        if (err instanceof Error && err.name === "AbortError") {
            proxyError = new AgentProxyError(
                "AGENT_REQUEST_TIMEOUT",
                `Agent request timed out after ${timeoutMs}ms.`,
                504,
                {
                    i18n: "errors.agentRequestTimedOut",
                    i18nParams: { timeoutSeconds: String(Math.round(timeoutMs / 1000)) }
                }
            );
        } else {
            const message = err instanceof Error ? err.message : "Agent request failed.";

            proxyError = new AgentProxyError(
                "AGENT_REQUEST_FAILED",
                message,
                503,
                {
                    i18n: "errors.agentForwardFailed"
                }
            );
        }

        throw proxyError;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Proxies instance-scoped requests from the control plane to node agents.
 */
export namespace AgentProxyService {
    /**
     * Resolves the agent URL for an instance.
     *
     * @param store Control plane store
     * @param instanceId Instance identifier
     * @returns Agent URL and instance metadata
     * @throws {AgentProxyError} {@link AgentProxyError}
     */
    export async function resolveAgentForInstance(
        store: ControlPlaneStore,
        instanceId: string
    ): Promise<{ instance: Instance; node: Node; agentUrl: string }> {
        const [instances, nodes] = await Promise.all([
            store.listInstances(),
            store.listNodes()
        ]);

        const instance = instances.find((entry) => entry.id === instanceId);

        if (!instance) {
            throw new AgentProxyError(
                "INSTANCE_NOT_FOUND",
                `Instance ${instanceId} was not found.`,
                404,
                {
                    i18n: "errors.instanceNotFound",
                    i18nParams: { instanceId }
                }
            );
        }

        const node = nodes.find((entry) => entry.id === instance.nodeId);

        if (!node?.agentUrl) {
            throw new AgentProxyError(
                "AGENT_UNAVAILABLE",
                `Node ${instance.nodeId} has no registered agent URL.`,
                503,
                {
                    i18n: "errors.agentUnavailable",
                    i18nParams: { nodeId: instance.nodeId }
                }
            );
        }

        return {
            instance,
            node,
            agentUrl: node.agentUrl
        };
    }

    /**
     * Fetches container logs from the node agent.
     *
     * @param store Control plane store
     * @param instanceId Instance identifier
     * @returns Log payload from the agent
     * @throws {AgentProxyError} {@link AgentProxyError}
     */
    export async function fetchLogs(
        store: ControlPlaneStore,
        instanceId: string
    ): Promise<{ instanceId: string; logs: string }> {
        const { agentUrl } = await resolveAgentForInstance(store, instanceId);
        const response = await fetchAgent(`${agentUrl}/containers/${encodeURIComponent(instanceId)}/logs`);

        if (!response.ok) {
            throw new AgentProxyError(
                "AGENT_REQUEST_FAILED",
                `Agent request failed with HTTP ${response.status}.`,
                response.status,
                {
                    i18n: "errors.agentRequestFailed",
                    i18nParams: { status: String(response.status) }
                }
            );
        }

        const body = await response.json() as { logs?: string };
        return {
            instanceId,
            logs: body.logs ?? ""
        };
    }

    /**
     * Executes a command inside an instance container through the node agent.
     *
     * @param store Control plane store
     * @param instanceId Instance identifier
     * @param command Command argv
     * @returns Exec result from the agent
     * @throws {AgentProxyError} {@link AgentProxyError}
     */
    export async function execCommand(
        store: ControlPlaneStore,
        instanceId: string,
        command: string[]
    ): Promise<{
        instanceId: string;
        exitCode: number;
        stdout: string;
        stderr: string;
    }> {
        const { agentUrl } = await resolveAgentForInstance(store, instanceId);
        const response = await fetchAgent(`${agentUrl}/containers/${encodeURIComponent(instanceId)}/exec`, {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json"
            },

            body: JSON.stringify({ command })
        });

        if (!response.ok) {
            throw new AgentProxyError(
                "AGENT_REQUEST_FAILED",
                `Agent request failed with HTTP ${response.status}.`,
                response.status,
                {
                    i18n: "errors.agentRequestFailed",
                    i18nParams: { status: String(response.status) }
                }
            );
        }

        const body = await response.json() as {
            exitCode?: number;
            stdout?: string;
            stderr?: string;
        };

        return {
            instanceId,
            exitCode: body.exitCode ?? 1,
            stdout: body.stdout ?? "",
            stderr: body.stderr ?? ""
        };
    }

    /**
     * Dispatches a generic JSON task to a node agent.
     *
     * @param agentUrl Node agent base URL
     * @param path Agent path
     * @param payload Request body
     * @returns Parsed JSON response
     * @throws {AgentProxyError} {@link AgentProxyError}
     */
    export async function postTask(
        agentUrl: string,
        path: string,
        payload: unknown
    ): Promise<unknown> {
        const response = await fetchAgent(`${agentUrl}${path}`, {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json"
            },

            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const proxyError = new AgentProxyError(
                "AGENT_REQUEST_FAILED",
                `Agent request failed with HTTP ${response.status}.`,
                response.status,
                {
                    i18n: "errors.agentRequestFailed",
                    i18nParams: { status: String(response.status) }
                }
            );

            throw proxyError;
        }

        return response.json();
    }

    /**
     * Sends an idempotent DELETE to a node agent sandbox route.
     *
     * @param agentUrl Node agent base URL
     * @param path Agent path including instance id
     * @returns Parsed JSON response when present
     * @throws {AgentProxyError} {@link AgentProxyError}
     */
    export async function deleteTask(agentUrl: string, path: string): Promise<unknown> {
        const response = await fetchAgent(`${agentUrl}${path}`, {
            method: "DELETE",
            headers: {
                Accept: "application/json"
            }
        });

        if (!response.ok && response.status !== 404) {
            throw new AgentProxyError(
                "AGENT_REQUEST_FAILED",
                `Agent request failed with HTTP ${response.status}.`,
                response.status,
                {
                    i18n: "errors.agentRequestFailed",
                    i18nParams: { status: String(response.status) }
                }
            );
        }

        if (response.status === 204) {
            return {};
        }

        return response.json();
    }

    /**
     * Fetches a backup archive from a node agent.
     *
     * @param agentUrl Node agent base URL
     * @param archivePath Absolute archive path on the agent
     * @returns Backup archive bytes
     * @throws {AgentProxyError} {@link AgentProxyError}
     */
    export async function fetchBackupArchive(agentUrl: string, archivePath: string): Promise<Buffer> {
        const url = `${agentUrl}/backups/archive?archivePath=${encodeURIComponent(archivePath)}`;
        logAgentProxy.debug("fetch backup archive path=%s", archivePath);
        const response = await fetchAgent(url);

        if (!response.ok) {
            throw new AgentProxyError(
                "AGENT_REQUEST_FAILED",
                `Agent request failed with HTTP ${response.status}.`,
                response.status,
                {
                    i18n: "errors.agentRequestFailed",
                    i18nParams: { status: String(response.status) }
                }
            );
        }

        return Buffer.from(await response.arrayBuffer());
    }

    /**
     * Posts a binary payload to a node agent endpoint.
     *
     * @param agentUrl Node agent base URL
     * @param path Agent path
     * @param body Binary request body
     * @param contentType Request content type
     * @returns Parsed JSON response
     * @throws {AgentProxyError} {@link AgentProxyError}
     */
    export async function postBinary(
        agentUrl: string,
        path: string,
        body: Buffer,
        contentType = "application/octet-stream"
    ): Promise<unknown> {
        logAgentProxy.debug("post binary path=%s bytes=%d", path, body.length);
        const response = await fetchAgent(`${agentUrl}${path}`, {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": contentType
            },

            body
        });

        if (!response.ok) {
            throw new AgentProxyError(
                "AGENT_REQUEST_FAILED",
                `Agent request failed with HTTP ${response.status}.`,
                response.status,
                {
                    i18n: "errors.agentRequestFailed",
                    i18nParams: { status: String(response.status) }
                }
            );
        }

        return response.json();
    }
}

/**
 * Typed proxy error for agent forwarding failures.
 */
export class AgentProxyError extends Error {
    /**
     * Creates an agent proxy error.
     *
     * @param code Stable error code
     * @param message Human-readable message
     * @param statusCode HTTP status to return
     * @param options Optional i18n key and params for UI localization
     */
    constructor(
        public readonly code: string,
        message: string,
        public readonly statusCode: number,
        public readonly options?: {
            i18n?: string;
            i18nParams?: Record<string, string>;
        }
    ) {
        super(message);
    }
}
