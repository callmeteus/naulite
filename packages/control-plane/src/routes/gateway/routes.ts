import { z } from "zod";

import { PaginatedListSchema, PaginationQuerySchema } from "@naulite/shared";

import { ControlPlaneService } from "../../ControlPlaneService";
import { PermissionPreHandlers } from "../../auth/PermissionPreHandlers";
import { defineRoute } from "../../routing/DefineRoute";

const GatewayRouteSummarySchema = z.object({
    id: z.string().min(1),
    serviceName: z.string().min(1),
    host: z.string().min(1),
    targetHost: z.string().min(1),
    targetPort: z.number().int().positive(),
    autoTls: z.boolean(),
    updatedAt: z.string()
});

export const GET = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("registry:read"),
    schema: {
        summary: "List gateway routes",
        description: "Lists Traefik gateway routes persisted by the control plane.",
        tags: ["gateway"],
        operationId: "listGatewayRoutes",
        querystring: PaginationQuerySchema,
        response: {
            200: PaginatedListSchema(GatewayRouteSummarySchema)
        }
    },
    async handler(req) {
        const paginated = await ControlPlaneService.Gateway.listRoutes(req.query);

        return {
            ...paginated,
            items: paginated.items.map((route) => ({
                id: route.id,
                serviceName: route.serviceName,
                host: route.host,
                targetHost: route.targetHost,
                targetPort: route.targetPort,
                autoTls: route.autoTls,
                updatedAt: route.updatedAt
            }))
        };
    }
});
