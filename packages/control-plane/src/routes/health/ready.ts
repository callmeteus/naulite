import { ControlPlaneService } from "../../ControlPlaneService";
import { defineRoute } from "../../routing/DefineRoute";

export const GET = defineRoute({
    async handler() {
        const databaseHealthy = await ControlPlaneService.Database.healthCheck();
        return {
            ready: databaseHealthy
        };
    }
});
