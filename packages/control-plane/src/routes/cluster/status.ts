import { ControlPlaneService } from "../../ControlPlaneService";
import { defineRoute } from "../../routing/DefineRoute";

export const GET = defineRoute({
    async handler() {
        const [nodes, services, instances, volumes, secrets] = await Promise.all([
            ControlPlaneService.Store.listNodes(),
            ControlPlaneService.Store.listServices(),
            ControlPlaneService.Store.listInstances(),
            ControlPlaneService.Store.listVolumes(),
            ControlPlaneService.Store.listSecrets()
        ]);

        const onlineNodes = nodes.filter((node) => node.status === "online").length;
        const databaseHealthy = await ControlPlaneService.Database.healthCheck();
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
            revision: String(ControlPlaneService.Apply.getRevision()),
            summary: {
                nodes: nodes.length,
                onlineNodes,
                services: services.length,
                instances: instances.length,
                runningInstances: instances.filter((instance) => instance.status === "running").length,
                volumes: volumes.length,
                secrets: secrets.length,
                applyRevision: ControlPlaneService.Apply.getRevision()
            },
            nodes,
            services,
            instances,
            volumes,
            secrets
        };
    }
});
