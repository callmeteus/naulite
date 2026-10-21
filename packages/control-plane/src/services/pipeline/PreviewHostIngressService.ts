import type { Node } from "@naulite/shared";

import { ControlPlaneService } from "../../ControlPlaneService";
import { Logger } from "../../Logger";

const logPreviewIngress = Logger.create("preview-ingress");

/**
 * Publishes Traefik routes for EVEN-* preview hosts.
 */
export namespace PreviewHostIngressService {
    /**
     * Registers or updates the gateway route for a preview hostname.
     *
     * @param hostname Public preview host (even-1234.lm.local.arpa)
     * @param nodeId Target cluster node id
     * @param serviceName Stable Traefik service name
     * @returns Nothing.
     */
    export async function ensurePreviewRoute(
        hostname: string,
        nodeId: string,
        serviceName: string
    ): Promise<void> {
        const nodes = await ControlPlaneService.Store.listNodes();
        const node = nodes.find((entry) => entry.id === nodeId);

        if (!node) {
            throw new Error(`Preview node ${nodeId} was not found for ingress sync.`);
        }

        const target = resolvePreviewTarget(node);

        logPreviewIngress.info(
            "preview ingress host=%s nodeId=%s target=%s:%d",
            hostname,
            nodeId,
            target.host,
            target.port
        );

        await ControlPlaneService.Gateway.upsertRoute({
            serviceName,
            ingress: {
                host: hostname,
                paths: [
                    {
                        path: "/",
                        port: target.port,
                        protocol: "http"
                    }
                ],
                exposure: "public",
                tls: {
                    enabled: false
                }
            },
            targetHost: target.host,
            targetPort: target.port
        });
    }

    /**
     * Resolves the HTTP target for a preview backend on the node.
     *
     * @param node Registered preview node
     * @returns Host and port for Traefik upstream
     */
    function resolvePreviewTarget(node: Node): { host: string; port: number } {
        const labelPort = node.labels.preview_http_port ?? node.labels["preview-http-port"];

        if (labelPort?.trim()) {
            return {
                host: "127.0.0.1",
                port: Number(labelPort)
            };
        }

        if (!node.agentUrl) {
            throw new Error(`Node ${node.id} does not expose an agent URL.`);
        }

        const agentUrl = new URL(node.agentUrl);
        const agentPort = Number(agentUrl.port || "80");

        // Lab convention: backend HTTP is published on host at agentPort + 10
        return {
            host: agentUrl.hostname,
            port: agentPort + 10
        };
    }
}
