import { NetBirdEnrollmentResponseSchema, RouteMessageResponseSchema } from "@naulite/shared";
import { ControlPlaneService } from "../../ControlPlaneService";
import {
    resolvePublicControlPlaneUrl,
    resolvePublicNetBirdManagementUrl
} from "../../bootstrap/BootstrapUrls";
import { HTTP503Error } from "../../errors/TreatedError";
import { PermissionPreHandlers } from "../../auth/PermissionPreHandlers";
import { defineRoute } from "../../routing/DefineRoute";

export const GET = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("netbird:read"),
    schema: {
        summary: "Get NetBird enrollment details",
        description: "Returns setup key and public URLs for enrolling infrastructure nodes and team devices.",
        tags: ["netbird"],
        operationId: "getNetBirdEnrollment",
        response: {
            200: NetBirdEnrollmentResponseSchema,
            503: RouteMessageResponseSchema
        }
    },

    async handler(req) {
        const netbirdManagementUrl = resolvePublicNetBirdManagementUrl();

        if (!netbirdManagementUrl) {
            throw new HTTP503Error("NetBird management URL is not configured.");
        }

        const setupKey = await ControlPlaneService.Enrollment.ensureSetupKey();

        return {
            setupKey,
            cpUrl: resolvePublicControlPlaneUrl(req),
            netbirdManagementUrl
        };
    }
});
