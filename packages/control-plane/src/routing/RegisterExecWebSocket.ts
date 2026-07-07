import type { FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import WebSocket from "ws";

import { PermissionPreHandlers } from "../auth/PermissionPreHandlers";
import { ControlPlaneService } from "../ControlPlaneService";
import { AgentProxyService } from "../services/AgentProxyService";
import { Logger } from "../Logger";
const log_exec_ws = Logger.create("exec-ws");


/**
 * Registers the interactive exec WebSocket proxy route.
 *
 * @param app Fastify application instance
 * @returns Nothing.
 */
export async function registerExecWebSocket(app: FastifyInstance): Promise<void> {
    await app.register(websocket);

    app.get(
        "/instances/:id/exec/ws",
        {
            websocket: true,
            preHandler: PermissionPreHandlers.authorizedWithPermission("workloads:write")
        },
        (clientSocket, request) => {
            void proxyExecWebSocket(clientSocket, request.params as { id: string }).catch((err) => {
                log_exec_ws.error("proxy failed: %O", err);
                clientSocket.close(1011, "exec proxy failed");
            });
        }
    );
}

/**
 * Proxies a client exec WebSocket to the responsible node agent.
 *
 * @param clientSocket Browser or CLI WebSocket connection
 * @param params Route params containing the instance id
 * @returns Nothing.
 */
async function proxyExecWebSocket(
    clientSocket: WebSocket,
    params: { id: string }
): Promise<void> {
    const store = ControlPlaneService.Store.instance();
    const { agentUrl } = await AgentProxyService.resolveAgentForInstance(store, params.id);
    const upstreamUrl = `${toWebSocketUrl(agentUrl)}/containers/${encodeURIComponent(params.id)}/exec/ws`;

    log_exec_ws.debug("proxy instanceId=%s upstream=%s", params.id, upstreamUrl);

    const upstreamSocket = new WebSocket(upstreamUrl);

    await new Promise<void>((resolve, reject) => {
        upstreamSocket.once("open", () => resolve());
        upstreamSocket.once("error", (err) => reject(err));
    });

    const closeBoth = (code: number, reason: string) => {
        if (clientSocket.readyState === WebSocket.OPEN) {
            clientSocket.close(code, reason);
        }

        if (upstreamSocket.readyState === WebSocket.OPEN) {
            upstreamSocket.close(code, reason);
        }
    };

    clientSocket.on("message", (data, isBinary) => {
        if (upstreamSocket.readyState !== WebSocket.OPEN) {
            return;
        }

        upstreamSocket.send(data, { binary: isBinary });
    });

    upstreamSocket.on("message", (data, isBinary) => {
        if (clientSocket.readyState !== WebSocket.OPEN) {
            return;
        }

        clientSocket.send(data, { binary: isBinary });
    });

    clientSocket.on("close", () => {
        closeBoth(1000, "client closed");
    });

    upstreamSocket.on("close", () => {
        closeBoth(1000, "upstream closed");
    });

    clientSocket.on("error", (err) => {
        log_exec_ws.error("client socket error: %O", err);
        closeBoth(1011, "client socket error");
    });

    upstreamSocket.on("error", (err) => {
        log_exec_ws.error("upstream socket error: %O", err);
        closeBoth(1011, "upstream socket error");
    });
}

/**
 * Converts an HTTP agent URL to WebSocket scheme.
 *
 * @param agentUrl Node agent base URL
 * @returns WebSocket URL with the same host and port
 */
function toWebSocketUrl(agentUrl: string): string {
    if (agentUrl.startsWith("https://")) {
        return `wss://${agentUrl.slice("https://".length)}`;
    }

    if (agentUrl.startsWith("http://")) {
        return `ws://${agentUrl.slice("http://".length)}`;
    }

    return agentUrl;
}
