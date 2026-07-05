import { ControlPlaneService } from "../../ControlPlaneService";
import { PermissionPreHandlers } from "../../auth/PermissionPreHandlers";
import { defineRoute } from "../../routing/DefineRoute";
import { LooseObjectSchema } from "@naulite/shared";

export const GET = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("metrics:read"),
    schema: {
        summary: "Get cluster status",
        description: "Returns a consolidated view of cluster health, leader, and inventory.",
        tags: ["cluster"],
        operationId: "getClusterStatus",
        response: {
            200: LooseObjectSchema
        }
    },
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
                controlPlaneId: ControlPlaneService.Instance.getId(),
                nodeCount: nodes.length,
                serviceCount: services.length
            },
            leaderId: ControlPlaneService.Leader.getLeaderId(),
            isLeader: ControlPlaneService.Leader.isLeader(),
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
