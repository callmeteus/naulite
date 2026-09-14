import type { ManifestService, Node } from "@naulite/shared";

import { TargetGroupService } from "../services/TargetGroupService";

/**
 * Resolves placement targets for scheduler and apply.
 */
export namespace TargetGroupResolver {
    /**
     * Resolves eligible online nodes for a manifest service placement.
     *
     * @param manifestService Manifest service definition
     * @param nodes Candidate cluster nodes
     * @returns Eligible nodes in stable order
     */
    export async function resolveEligibleNodes(
        manifestService: ManifestService | undefined,
        nodes: Node[]
    ): Promise<Node[]> {
        const placement = manifestService?.placement;
        const online = nodes.filter((node) => node.status === "online" || node.status === "registering");

        if (!placement?.target && !placement?.targetGroup) {
            return online;
        }

        if (placement.target) {
            const pinned = online.find((node) => {
                return node.id === placement.target || node.hostname === placement.target;
            });

            return pinned ? [pinned] : [];
        }

        if (placement.targetGroup) {
            const memberIds = await TargetGroupService.resolveOnlineMemberNodeIds(placement.targetGroup);
            const memberSet = new Set(memberIds);

            return online.filter((node) => memberSet.has(node.id));
        }

        return [];
    }
}
