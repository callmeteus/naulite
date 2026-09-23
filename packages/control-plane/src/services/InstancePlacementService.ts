import type { ManifestService } from "@naulite/shared";

/**
 * Placement rules for moving instances away from unreachable nodes.
 */
export namespace InstancePlacementService {
    /**
     * Returns whether an instance may be scheduled on another online node.
     *
     * @param manifestService Manifest service definition for the workload
     * @returns True when placement is not pinned to a node or target group
     */
    export function allowsRescheduleAwayFromNode(manifestService?: ManifestService): boolean {
        const placement = manifestService?.placement;

        if (placement?.target) {
            return false;
        }

        if (placement?.targetGroup) {
            return false;
        }

        return true;
    }
}
