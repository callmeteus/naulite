import { z } from "zod";

import { ControlPlaneService } from "../../ControlPlaneService";
import { AuthPreHandlers } from "../../auth/AuthPreHandlers";
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
    preHandler: AuthPreHandlers.authorizedLocalOrApiKey,
    schema: {
        summary: "List gateway routes",
        description: "Lists Traefik gateway routes persisted by the control plane.",
        tags: ["gateway"],
        operationId: "listGatewayRoutes",
        response: {
            200: z.array(GatewayRouteSummarySchema)
        }
    },
    async handler() {
        const routes = await ControlPlaneService.Gateway.listRoutes();

        return routes.map((route) => ({
            id: route.id,
            serviceName: route.serviceName,
            host: route.host,
            targetHost: route.targetHost,
            targetPort: route.targetPort,
            autoTls: route.autoTls,
            updatedAt: route.updatedAt
        }));
    }
});
