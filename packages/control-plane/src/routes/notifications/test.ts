import { NotificationDestinationTestResponseSchema } from "@naulite/shared";

import { AuthPreHandlers } from "../../auth/AuthPreHandlers";
import { LeaderPreHandlers } from "../../auth/LeaderPreHandlers";
import { PermissionPreHandlers } from "../../auth/PermissionPreHandlers";
import { defineRoute } from "../../routing/DefineRoute";
import { RunNotificationDispatcher } from "../../services/RunNotificationDispatcher";

export const POST = defineRoute({
    preHandler: [
        AuthPreHandlers.authorizedLocalOrApiKey,
        LeaderPreHandlers.requireLeader(),
        PermissionPreHandlers.requirePermission("notifications:write")
    ],
    schema: {
        summary: "Test notification providers",
        description: "Sends a synthetic pipeline notification to every enabled notification destination.",
        tags: ["notifications"],
        operationId: "testNotificationProviders",
        response: {
            200: NotificationDestinationTestResponseSchema
        }
    },
    async handler() {
        return {
            destinations: await RunNotificationDispatcher.testPing()
        };
    }
});
