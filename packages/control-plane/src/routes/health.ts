import { ControlPlaneService } from "../ControlPlaneService";
import { defineRoute } from "../routing/DefineRoute";
import { HealthSummaryResponseSchema } from "@platform/shared";

export const GET = defineRoute({
    schema: {
        summary: "Health check",
        description: "Checks aggregated control plane, database, and node health.",
        tags: ["health"],
        operationId: "getHealth",
        response: {
            200: HealthSummaryResponseSchema
        }
    },
    async handler() {
        const databaseHealthy = await ControlPlaneService.Database.healthCheck();
        const [nodes, services] = await Promise.all([
            ControlPlaneService.Store.listNodes(),
            ControlPlaneService.Store.listServices()
        ]);

        const onlineNodes = nodes.filter((node) => node.status === "online").length;
        const status = !databaseHealthy
            ? "unhealthy"
            : onlineNodes === 0
                ? "degraded"
                : "healthy";

        return {
            status,
            controlPlaneId: process.env.CP_INSTANCE_ID ?? "control-plane",
            nodeCount: nodes.length,
            serviceCount: services.length,
            database: databaseHealthy ? "up" : "down",
            timestamp: new Date().toISOString()
        };
    }
});
