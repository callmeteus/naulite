import { z } from "zod";

import { AuthPreHandlers } from "../../auth/AuthPreHandlers";
import { LeaderPreHandlers } from "../../auth/LeaderPreHandlers";
import { PermissionPreHandlers } from "../../auth/PermissionPreHandlers";
import { defineRoute } from "../../routing/DefineRoute";
import { RunNotificationDispatcher } from "../../services/RunNotificationDispatcher";

const NotificationTestResultSchema = z.object({
    id: z.string(),
    ok: z.boolean(),
    error: z.string().optional()
});

const NotificationTestResponseSchema = z.object({
    providers: z.array(NotificationTestResultSchema)
});

export const POST = defineRoute({
    preHandler: [
        AuthPreHandlers.authorizedLocalOrApiKey,
        LeaderPreHandlers.requireLeader(),
        PermissionPreHandlers.requirePermission("notifications:write")
    ],
    schema: {
        summary: "Test notification providers",
        description: "Sends a synthetic pipeline notification to every registered notification provider.",
        tags: ["notifications"],
        operationId: "testNotificationProviders",
        response: {
            200: NotificationTestResponseSchema
        }
    },
    async handler() {
        return {
            providers: await RunNotificationDispatcher.testPing()
        };
    }
});
