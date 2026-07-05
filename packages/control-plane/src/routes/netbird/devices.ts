import { ControlPlaneService } from "../../ControlPlaneService";
import { PermissionPreHandlers } from "../../auth/PermissionPreHandlers";
import { defineRoute } from "../../routing/DefineRoute";
import { NetBirdDevicesListResponseSchema } from "@naulite/shared";

export const GET = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("netbird:read"),
    schema: {
        summary: "List NetBird devices",
        description: "Lists devices known to self-hosted NetBird.",
        tags: ["netbird"],
        operationId: "listNetBirdDevices",
        response: {
            200: NetBirdDevicesListResponseSchema
        }
    },
    async handler() {
        return {
            devices: await ControlPlaneService.NetBird.listDevices()
        };
    }
});
