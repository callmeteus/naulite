import type { ControlPlaneContext } from "../ControlPlaneContext";
import { ClusterStateService } from "./ClusterStateService";
import { ControlPlaneSync, type ControlPlaneSyncEvent } from "./ControlPlaneSync";

/**
 * Default control plane sync event subscribers for HA cache invalidation.
 */
export namespace ControlPlaneSyncSubscribers {
    /**
     * Registers built-in sync subscribers on the control plane sync service.
     *
     * @param context Control plane application context
     * @returns Nothing.
     */
    export function register(context: ControlPlaneContext): void {
        context.controlPlaneSync.on(ControlPlaneSync.EVENTS.APPLY_REVISION_CHANGED, (event) => {
            void handleApplyRevisionChanged(context, event).catch(() => undefined);
        });
        context.controlPlaneSync.on(ControlPlaneSync.EVENTS.SECRET_CHANGED, (event) => {
            void handleSecretChanged(context, event).catch(() => undefined);
        });
        context.controlPlaneSync.on(ControlPlaneSync.EVENTS.CLUSTER_INVALIDATED, (event) => {
            console.debug(
                "[sync] cluster invalidated source=%s payload=%o",
                event.sourceInstanceId,
                event.payload
            );
        });
        context.controlPlaneSync.on(ControlPlaneSync.EVENTS.GATEWAY_ROUTE_CHANGED, () => {
            void context.gatewayRouteService.reloadFromDatabase().catch(() => undefined);
        });
        context.controlPlaneSync.on(ControlPlaneSync.EVENTS.LEADER_CHANGED, (event) => {
            console.debug(
                "[sync] leader changed leaderId=%s source=%s",
                event.payload.leaderId,
                event.sourceInstanceId
            );
            void context.gatewayRouteService.reloadFromDatabase().catch(() => undefined);
        });
    }

    /**
     * Applies a remote apply revision update to the local context.
     *
     * @param context Control plane application context
     * @param event Sync event payload
     * @returns Nothing.
     */
    async function handleApplyRevisionChanged(
        context: ControlPlaneContext,
        event: ControlPlaneSyncEvent
    ): Promise<void> {
        const revision = event.payload.revision;

        if (typeof revision !== "number") {
            return;
        }

        context.applyRevision = revision;
        await ClusterStateService.saveApplyRevision(revision);
        console.debug("[sync] apply revision updated revision=%d source=%s", revision, event.sourceInstanceId);
    }

    /**
     * Handles secret change notifications from peer control plane instances.
     *
     * @param context Control plane application context
     * @param event Sync event payload
     * @returns Nothing.
     */
    async function handleSecretChanged(
        context: ControlPlaneContext,
        event: ControlPlaneSyncEvent
    ): Promise<void> {
        console.debug(
            "[sync] secret changed name=%s source=%s",
            event.payload.name,
            event.sourceInstanceId
        );
        void context;
    }
}
