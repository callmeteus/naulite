import { z } from "zod";

import { ManifestNameQuerySchema, ServiceSchema } from "@naulite/shared";
import { ControlPlaneService } from "../ControlPlaneService";
import { PermissionPreHandlers } from "../auth/PermissionPreHandlers";
import { defineRoute } from "../routing/DefineRoute";

export const GET = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("workloads:read"),
    schema: {
        summary: "List services",
        description: "Lists services registered in the cluster, with an optional manifest filter.",
        tags: ["services"],
        operationId: "listServices",
        querystring: ManifestNameQuerySchema,
        response: {
            200: z.array(ServiceSchema)
        }
    },
    async handler(req) {
        const { manifestName } = req.query;
        return (await ControlPlaneService.Store.listServices())
            .filter((service) => !manifestName || service.manifestName === manifestName);
    }
});
