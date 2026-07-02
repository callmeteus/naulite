import { z } from "zod";

import { ControlPlaneService } from "../ControlPlaneService";
import { defineRoute } from "../routing/DefineRoute";

export const GET = defineRoute({
    async handler(req) {
        const query = z.object({
            serviceName: z.string().min(1).optional(),
            nodeId: z.string().min(1).optional()
        }).parse(req.query);
        return (await ControlPlaneService.Store.listInstances())
            .filter((instance) => {
                if (query.serviceName && instance.serviceName !== query.serviceName) {
                    return false;
                }

                if (query.nodeId && instance.nodeId !== query.nodeId) {
                    return false;
                }

                return true;
            });
    }
});
