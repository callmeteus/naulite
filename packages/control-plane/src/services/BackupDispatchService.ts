import type { BackupTask, Node, Volume } from "@platform/shared";

import { AgentProxyService } from "./AgentProxyService";

/**
 * Shared backup dispatch helpers for routes and schedulers.
 */
export namespace BackupDispatchService {
    /**
     * Resolves the agent node responsible for a volume using node affinity.
     *
     * @param volume Volume metadata
     * @param nodes Registered cluster nodes
     * @returns Node with an agent URL when available
     */
    export function resolveNodeForVolume(volume: Volume, nodes: Node[]): Node | undefined {
        if (volume.nodeId) {
            const affinityNode = nodes.find((node) => node.id === volume.nodeId && node.agentUrl);

            if (affinityNode) {
                return affinityNode;
            }
        }

        return nodes.find((node) => node.agentUrl);
    }

    /**
     * Builds the backup task payload sent to an agent.
     *
     * @param volume Volume metadata including backup policy
     * @param taskId Backup run identifier
     * @returns Backup task payload
     */
    export function buildTaskPayload(volume: Volume, taskId: string): BackupTask {
        return {
            taskId,
            volumeId: volume.id,
            volumeName: volume.name,
            nodeId: volume.nodeId ?? "unscheduled",
            includes: volume.backup?.includes ?? [],
            excludes: volume.backup?.excludes ?? [],
            retention: volume.backup?.retention,
            destination: volume.backup?.destination ?? {
                provider: "local",
                path: "/var/lib/platform/backups"
            },
            resolvedSecrets: {},
            status: "pending"
        };
    }

    /**
     * Dispatches a backup task to the selected agent node.
     *
     * @param node Target node with an agent URL
     * @param payload Backup task payload
     * @returns Agent response payload
     */
    export async function dispatchBackupTask(node: Node, payload: BackupTask): Promise<unknown> {
        if (!node.agentUrl) {
            throw new Error(`Node ${node.id} does not expose an agent URL.`);
        }

        return AgentProxyService.postTask(node.agentUrl, "/tasks/backup", {
            ...payload,
            mountPath: volumeMountPath(payload.volumeName)
        });
    }

    /**
     * Dispatches a restore task to the node that owns the target volume.
     *
     * @param node Target node with an agent URL
     * @param input Restore request payload
     * @returns Agent response payload
     */
    export async function dispatchRestoreTask(
        node: Node,
        input: {
            backupId: string;
            volumeName: string;
            archivePath?: string;
            mountPath?: string;
        }
    ): Promise<unknown> {
        if (!node.agentUrl) {
            throw new Error(`Node ${node.id} does not expose an agent URL.`);
        }

        const archivePath = input.archivePath ?? `/var/lib/platform/backups/${input.backupId}.tar.gz`;
        const mountPath = input.mountPath ?? volumeMountPath(input.volumeName);

        return AgentProxyService.postTask(node.agentUrl, "/tasks/backup/restore", {
            backupId: input.backupId,
            volumeName: input.volumeName,
            archivePath,
            mountPath
        });
    }

    /**
     * Builds the default mount path for a named volume on agents.
     *
     * @param volumeName Volume name
     * @returns Absolute mount path on the agent
     */
    export function volumeMountPath(volumeName: string): string {
        return `/var/lib/platform/volumes/${volumeName}`;
    }
}
