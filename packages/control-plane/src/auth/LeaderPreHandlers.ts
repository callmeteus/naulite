import type { preHandlerHookHandler } from "fastify";

import { ControlPlaneService } from "../ControlPlaneService";
import { HTTP503Error } from "../errors/TreatedError";

/**
 * Leader election route guards for HA control plane deployments.
 */
export namespace LeaderPreHandlers {
    /**
     * Restricts a route to the elected cluster leader.
     *
     * @returns Fastify preHandler
     */
    export function requireLeader(): preHandlerHookHandler {
        return async () => {
            if (!ControlPlaneService.Leader.isLeader()) {
                throw new HTTP503Error("Cluster leader is unavailable. Retry the request on the leader instance.", {
                    error: "not_leader",
                    leaderId: ControlPlaneService.Leader.getLeaderId()
                });
            }
        };
    }
}
