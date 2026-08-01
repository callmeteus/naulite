import { Logger } from "../Logger";
import type { ControlPlaneContext } from "../ControlPlaneContext";

import { NetBirdConfig } from "./NetBirdConfig";
import { MockNetBirdAdapter } from "./NetBirdService";

const logNetbird = Logger.create("netbird");

/**
 * Bootstraps the in-memory NetBird mock used by `yarn dev`.
 */
export namespace NetBirdDevBootstrap {
    /**
     * Seeds mock mesh groups, devices, ACLs, and enrollment secrets for local development.
     *
     * @param context Control plane application context
     * @returns Nothing.
     */
    export async function bootstrapIfNeeded(context: ControlPlaneContext): Promise<void> {
        if (!NetBirdConfig.useMockAdapter()) {
            return;
        }

        if (!(context.netBirdAdapter instanceof MockNetBirdAdapter)) {
            return;
        }

        const nodes = await context.store.listNodes();
        const meshNodes: Array<{ deviceId: string; hostname: string }> = [];

        for (const node of nodes) {
            const deviceId = node.netbirdDeviceId ?? `mock-peer-${node.id}`;

            if (!node.netbirdDeviceId) {
                await context.store.saveNode({
                    ...node,
                    netbirdDeviceId: deviceId
                });
            }

            meshNodes.push({
                deviceId,
                hostname: node.hostname
            });
        }

        await context.netBirdAdapter.bootstrapDevMesh(meshNodes);
        await context.netBirdEnrollment.ensureSetupKey();

        const topology = await context.netBirdService.getTopology();
        logNetbird.debug(
            "dev mock mesh ready groups=%d devices=%d acls=%d nodes=%d",
            topology.groups.length,
            topology.devices.length,
            topology.acls.length,
            meshNodes.length
        );
    }
}
