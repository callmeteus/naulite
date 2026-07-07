import { z } from "zod";

/**
 * Ingress route exposed by a service.
 */
export const IngressRouteSchema = z.object({
    serviceName: z.string(),
    hosts: z.array(z.string()),
    tlsEnabled: z.boolean()
});
