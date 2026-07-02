import type { FastifyInstance } from "fastify";

/**
 * Registers cluster status routes.
 * 
 * @param app Fastify application instance
 * @returns Nothing.
 */
export async function registerClusterRoutes(app: FastifyInstance): Promise<void> {
    app.get("/cluster/status", async () => {
        const [nodes, services, instances, volumes, secrets] = await Promise.all([
            app.controlPlane.store.listNodes(),
            app.controlPlane.store.listServices(),
            app.controlPlane.store.listInstances(),
            app.controlPlane.store.listVolumes(),
            app.controlPlane.store.listSecrets()
        ]);

        return {
            summary: {
                nodes: nodes.length,
                onlineNodes: nodes.filter((node) => node.status === "online").length,
                services: services.length,
                instances: instances.length,
                runningInstances: instances.filter((instance) => instance.status === "running").length,
                volumes: volumes.length,
                secrets: secrets.length,
                applyRevision: app.controlPlane.applyRevision
            },
            nodes,
            services,
            instances,
            volumes,
            secrets
        };
    });
}
