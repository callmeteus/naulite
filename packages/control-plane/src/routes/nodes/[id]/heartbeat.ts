import { z } from "zod";

import { ControlPlaneService } from "../../../ControlPlaneService";
import { defineRoute } from "../../../routing/DefineRoute";

const HeartbeatBodySchema = z.object({
    status: z.enum(["online", "offline", "draining", "unhealthy"]).default("online"),
    resources: z.object({
        cpuMillisTotal: z.number().int().nonnegative(),
        cpuMillisUsed: z.number().int().nonnegative(),
        memoryMbTotal: z.number().int().nonnegative(),
        memoryMbUsed: z.number().int().nonnegative(),
        diskMbTotal: z.number().int().nonnegative(),
        diskMbUsed: z.number().int().nonnegative()
    }).optional()
});

export const POST = defineRoute({
    async handler(req, res) {
        const routeParams = z.object({ id: z.string().min(1) }).parse(req.params);
        const body = HeartbeatBodySchema.parse(req.body);
        const updated = await ControlPlaneService.Store.updateNodeHeartbeat(routeParams.id, {
            status: body.status,
            resources: body.resources
        });

        if (!updated) {
            res.code(404);
            return { message: "Node not found." };
        }

        return updated;
    }
});
