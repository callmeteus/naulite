import { z } from "zod";

import { ControlPlaneService } from "../ControlPlaneService";
import { AuthPreHandlers } from "../auth/AuthPreHandlers";
import { defineRoute } from "../routing/DefineRoute";
import { IngressRouteSchema } from "@platform/shared";

export const GET = defineRoute({
    preHandler: AuthPreHandlers.authorizedLocalOrApiKey,
    schema: {
        summary: "List ingress routes",
        description: "Lists hosts and TLS exposure for services with ingress configured.",
        tags: ["ingress"],
        operationId: "listIngressRoutes",
        response: {
            200: z.array(IngressRouteSchema)
        }
    },
    async handler() {
        const services = await ControlPlaneService.Store.listServices();

        return services
            .filter((service) => service.ingress !== undefined && service.ingress !== null)
            .map((service) => ({
                serviceName: service.name,
                hosts: service.ingress?.host ? [service.ingress.host] : [],
                tlsEnabled: service.ingress?.tls?.enabled ?? false
            }));
    }
});
