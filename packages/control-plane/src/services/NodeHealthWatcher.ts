import type { Node } from "@platform/shared";

import { PipelineRunService } from "./PipelineRunService";

/**
 * Tracks node health transitions and emits infra events.
 */
export namespace NodeHealthWatcher {
    const diskPressureByNode = new Map<string, boolean>();
    const lastStatusByNode = new Map<string, string>();

    /**
     * Evaluates heartbeat telemetry and emits node infra events.
     *
     * @param node Updated node record
     * @returns Nothing.
     */
    export async function onHeartbeat(node: Node): Promise<void> {
        const pool = PipelineRunService.resolvePoolFromLabels(node.labels);
        const threshold = Number(process.env.PLATFORM_NODE_DISK_PRESSURE_RATIO ?? 0.85);
        const diskTotal = node.resources.diskMbTotal;
        const diskUsed = node.resources.diskMbUsed;
        const usageRatio = diskTotal > 0 ? diskUsed / diskTotal : 0;
        const hasPressure = usageRatio >= threshold;
        const previousPressure = diskPressureByNode.get(node.id) ?? false;

        if (hasPressure && !previousPressure) {
            diskPressureByNode.set(node.id, true);
            const run = await createNodeEventRun(node, pool);
            await PipelineRunService.emitEvent(run.id, {
                kind: "node.disk_pressure",
                message: `Node disk pressure ${node.hostname}`,
                nodeId: node.id,
                nodeHostname: node.hostname,
                pool,
                metadata: {
                    diskMbTotal: diskTotal,
                    diskMbUsed: diskUsed,
                    usageRatio
                }
            });
        } else if (!hasPressure && previousPressure) {
            diskPressureByNode.set(node.id, false);
            const run = await createNodeEventRun(node, pool);
            await PipelineRunService.emitEvent(run.id, {
                kind: "node.disk_pressure.cleared",
                message: `Node disk pressure cleared ${node.hostname}`,
                nodeId: node.id,
                nodeHostname: node.hostname,
                pool
            });
        }

        const previousStatus = lastStatusByNode.get(node.id);

        if (previousStatus && previousStatus !== node.status) {
            const run = await createNodeEventRun(node, pool);
            const kind = node.status === "online" ? "node.joined_cluster" : "node.left_cluster";

            await PipelineRunService.emitEvent(run.id, {
                kind,
                message: `${kind === "node.joined_cluster" ? "Node joined cluster" : "Node left cluster"} ${node.hostname}`,
                nodeId: node.id,
                nodeHostname: node.hostname,
                pool,
                metadata: { status: node.status }
            });
        }

        lastStatusByNode.set(node.id, node.status);
    }

    /**
     * Creates a node_event pipeline run row.
     *
     * @param node Node record
     * @param pool Optional pool label
     * @returns Created pipeline run
     */
    async function createNodeEventRun(node: Node, pool?: string) {
        return PipelineRunService.createRun({
            kind: "node_event",
            nodeId: node.id,
            nodeHostname: node.hostname,
            pool,
            workflowId: `node-${node.id}-${Date.now()}`
        });
    }
}
