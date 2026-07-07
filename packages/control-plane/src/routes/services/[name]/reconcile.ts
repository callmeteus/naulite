import { z } from "zod";

import { NameParamsSchema } from "@naulite/shared";

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

const ServiceReconcileResultSchema = z.object({
    serviceName: z.string(),
    results: z.array(InstanceReconcileResultSchema)
});

export const POST = defineRoute({
    preHandler: [
        AuthPreHandlers.authorizedLocalOrApiKey,
        LeaderPreHandlers.requireLeader(),
        PermissionPreHandlers.requirePermission("workloads:write")
    ],

    schema: {
        summary: "Reconcile service instances",
        description: "Manually re-dispatches pending or failed instances for a service.",
        tags: ["services"],
        operationId: "reconcileService",
        params: NameParamsSchema,
        response: {
            200: ServiceReconcileResultSchema
        }
    },

    async handler(req) {
        const { name } = req.params;
        const services = await ControlPlaneService.Store.listServices();
        const service = services.find((entry) => entry.name === name);

        if (!service) {
            throw new HTTP404Error(`Service ${name} not found.`, {
                error: "not_found"
            });
        }

        return ControlPlaneService.InstanceReconciler.reconcileService(name, {
            force: true
        });
    }
});
