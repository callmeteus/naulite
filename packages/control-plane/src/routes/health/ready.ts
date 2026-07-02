import { ControlPlaneService } from "../../ControlPlaneService";
import { defineRoute } from "../../routing/DefineRoute";
import { HealthReadyResponseSchema } from "@platform/shared";

export const GET = defineRoute({
    schema: {
        summary: "Readiness probe",
        description: "Indicates whether the control plane is ready to receive traffic.",
        tags: ["health"],
        operationId: "getReadiness",
        response: {
            200: HealthReadyResponseSchema
        }
    },
    async handler() {
        const databaseHealthy = await ControlPlaneService.Database.healthCheck();
        return {
            ready: databaseHealthy
        };
    }
});
