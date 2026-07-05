import type { Instance, Node } from "@naulite/shared";

import type { ControlPlaneStore } from "../database/ControlPlaneStore";

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
            throw new AgentProxyError("INSTANCE_NOT_FOUND", `Instância ${instanceId} não encontrada.`, 404);
        }

        const node = nodes.find((entry) => entry.id === instance.nodeId);

        if (!node?.agentUrl) {
            throw new AgentProxyError(
                "AGENT_UNAVAILABLE",
                `Nó ${instance.nodeId} não possui URL de agente registrada.`,
                503
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
     */
    export async function fetchLogs(
        store: ControlPlaneStore,
        instanceId: string
    ): Promise<{ instanceId: string; logs: string }> {
        const { agentUrl } = await resolveAgentForInstance(store, instanceId);
        const response = await fetch(`${agentUrl}/containers/${encodeURIComponent(instanceId)}/logs`);

        if (!response.ok) {
            throw new AgentProxyError(
                "AGENT_REQUEST_FAILED",
                `Falha ao buscar logs do agente: HTTP ${response.status}.`,
                response.status
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
        const response = await fetch(`${agentUrl}/containers/${encodeURIComponent(instanceId)}/exec`, {
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
                `Falha ao executar comando no agente: HTTP ${response.status}.`,
                response.status
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
     */
    export async function postTask(
        agentUrl: string,
        path: string,
        payload: unknown
    ): Promise<unknown> {
        const response = await fetch(`${agentUrl}${path}`, {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new AgentProxyError(
                "AGENT_REQUEST_FAILED",
                `Falha ao despachar tarefa ao agente: HTTP ${response.status}.`,
                response.status
            );
        }

        return response.json();
    }

    /**
     * Fetches a backup archive from a node agent.
     *
     * @param agentUrl Node agent base URL
     * @param archivePath Absolute archive path on the agent
     * @returns Backup archive bytes
     */
    export async function fetchBackupArchive(agentUrl: string, archivePath: string): Promise<Buffer> {
        const url = `${agentUrl}/backups/archive?archivePath=${encodeURIComponent(archivePath)}`;
        console.debug("[agent-proxy] fetch backup archive path=%s", archivePath);
        const response = await fetch(url);

        if (!response.ok) {
            throw new AgentProxyError(
                "AGENT_REQUEST_FAILED",
                `Falha ao buscar arquivo de backup no agente: HTTP ${response.status}.`,
                response.status
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
     */
    export async function postBinary(
        agentUrl: string,
        path: string,
        body: Buffer,
        contentType = "application/octet-stream"
    ): Promise<unknown> {
        console.debug("[agent-proxy] post binary path=%s bytes=%d", path, body.length);
        const response = await fetch(`${agentUrl}${path}`, {
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
                `Falha ao enviar arquivo ao agente: HTTP ${response.status}.`,
                response.status
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
     */
    constructor(
        public readonly code: string,
        message: string,
        public readonly statusCode: number
    ) {
        super(message);
    }
}
