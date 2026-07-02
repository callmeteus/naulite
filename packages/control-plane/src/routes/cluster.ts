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

        const onlineNodes = nodes.filter((node) => node.status === "online").length;
        const databaseHealthy = await app.controlPlane.databaseProvider.healthCheck();
        const healthStatus = !databaseHealthy
            ? "unhealthy"
            : onlineNodes === 0
                ? "degraded"
                : "healthy";

        return {
            health: {
                status: healthStatus,
                controlPlaneId: process.env.CP_INSTANCE_ID ?? "control-plane",
                nodeCount: nodes.length,
                serviceCount: services.length
            },
            leaderId: process.env.CP_INSTANCE_ID ?? "control-plane",
            revision: String(app.controlPlane.applyRevision),
            summary: {
                nodes: nodes.length,
                onlineNodes,
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
