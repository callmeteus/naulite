import { ControlPlaneService } from "../../ControlPlaneService";
import { AuthPreHandlers } from "../../auth/AuthPreHandlers";
import { defineRoute } from "../../routing/DefineRoute";
import { NetBirdDevicesListResponseSchema } from "@platform/shared";

export const GET = defineRoute({
    preHandler: AuthPreHandlers.authorizedLocalOrApiKey,
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
