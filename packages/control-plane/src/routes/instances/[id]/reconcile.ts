import { z } from "zod";

import { IdParamsSchema } from "@naulite/shared";

import { AuthPreHandlers } from "../../../auth/AuthPreHandlers";
import { LeaderPreHandlers } from "../../../auth/LeaderPreHandlers";
import { PermissionPreHandlers } from "../../../auth/PermissionPreHandlers";
import { ControlPlaneService } from "../../../ControlPlaneService";
import { HTTP404Error } from "../../../errors/TreatedError";
import { defineRoute } from "../../../routing/DefineRoute";

const InstanceReconcileResultSchema = z.object({
    instanceId: z.string(),
    status: z.enum(["dispatched", "skipped", "failed"]),
    message: z.string().optional()
});

export const POST = defineRoute({
    preHandler: [
        AuthPreHandlers.authorizedLocalOrApiKey,
        LeaderPreHandlers.requireLeader(),
        PermissionPreHandlers.requirePermission("workloads:write")
    ],
    schema: {
        summary: "Reconcile instance",
        description: "Manually re-dispatches a pending or failed workload instance to its agent.",
        tags: ["instances"],
        operationId: "reconcileInstance",
        params: IdParamsSchema,
        response: {
            200: InstanceReconcileResultSchema
        }
    },
    async handler(req) {
        const { id } = req.params;
        const instances = await ControlPlaneService.Store.listInstances();
        const instance = instances.find((entry) => entry.id === id);

        if (!instance) {
            throw new HTTP404Error(`Instance ${id} not found.`, {
                error: "not_found"
            });
        }

        return ControlPlaneService.InstanceReconciler.reconcileInstance(id, instances, undefined, {
            force: true
        });
    }
});
