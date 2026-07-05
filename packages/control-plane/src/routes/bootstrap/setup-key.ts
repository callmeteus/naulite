import { AuthPreHandlers } from "../../auth/AuthPreHandlers";
import { ControlPlaneService } from "../../ControlPlaneService";
import { defineRoute } from "../../routing/DefineRoute";
import { RouteMessageResponseSchema, SetupKeyResponseSchema } from "@naulite/shared";

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
