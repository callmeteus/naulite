import { HealthLiveResponseSchema } from "@naulite/shared";
import { defineRoute } from "../../routing/DefineRoute";

export const GET = defineRoute({
    schema: {
        summary: "Liveness probe",
        description: "Confirms that the control plane process is responding.",
        tags: ["health"],
        operationId: "getLiveness",
        response: {
            200: HealthLiveResponseSchema
        }
    },

    handler() {
        return { status: "ok" };
    }
});
