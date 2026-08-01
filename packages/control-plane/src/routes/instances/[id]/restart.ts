import { z } from "zod";

import { IdParamsSchema } from "@naulite/shared";

import { ControlPlaneService } from "../../../ControlPlaneService";
import { AuthPreHandlers } from "../../../auth/AuthPreHandlers";
import { LeaderPreHandlers } from "../../../auth/LeaderPreHandlers";
import { PermissionPreHandlers } from "../../../auth/PermissionPreHandlers";
import { defineRoute } from "../../../routing/DefineRoute";

const InstanceLifecycleResultSchema = z.object({
    instanceId: z.string(),
    status: z.enum(["dispatched", "failed"]),
    message: z.string().optional()
});

export const POST = defineRoute({
    preHandler: [
        AuthPreHandlers.authorizedLocalOrApiKey,
        LeaderPreHandlers.requireLeader(),
        PermissionPreHandlers.requirePermission("workloads:write")
    ],

    schema: {
        summary: "Restart instance",
        description: "Restarts a running workload instance on its scheduled node agent.",
        tags: ["instances"],
        operationId: "restartInstance",
        params: IdParamsSchema,
        response: {
            200: InstanceLifecycleResultSchema
        }
    },

    async handler(req) {
        return ControlPlaneService.InstanceLifecycle.restartInstance(req.params.id);
    }
});
