import { RouteMessageResponseSchema, SetupKeyResponseSchema } from "@naulite/shared";
import { ControlPlaneService } from "../../ControlPlaneService";
import { AuthPreHandlers } from "../../auth/AuthPreHandlers";
import { defineRoute } from "../../routing/DefineRoute";

export const GET = defineRoute({
    preHandler: AuthPreHandlers.requireLocalBootstrapRequest(),
    schema: {
        summary: "Get local setup key",
        description: "Returns the NetBird setup key for local bootstrap via loopback.",
        tags: ["bootstrap"],
        operationId: "getLocalSetupKey",
        response: {
            200: SetupKeyResponseSchema,
            403: RouteMessageResponseSchema
        }
    },

    async handler() {
        const setupKey = await ControlPlaneService.Enrollment.ensureSetupKey();

        return { setupKey };
    }
});
