import type { FastifyInstance } from "fastify";

/**
 * Registers ingress listing routes.
 *
 * @param app Fastify application instance
 * @returns Nothing.
 */
export async function registerIngressRoutes(app: FastifyInstance): Promise<void> {
    app.get("/ingress", async () => {
        const services = await app.controlPlane.store.listServices();

        return services
            .filter((service) => service.ingress !== undefined && service.ingress !== null)
            .map((service) => ({
                serviceName: service.name,
                hosts: service.ingress?.host ? [service.ingress.host] : [],
                tlsEnabled: service.ingress?.tls?.enabled ?? false
            }));
    });
}
