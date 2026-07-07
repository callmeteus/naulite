import { z } from "zod";

import { IdParamsSchema } from "@naulite/shared";

import { AuthPreHandlers } from "../../../../auth/AuthPreHandlers";
import { LeaderPreHandlers } from "../../../../auth/LeaderPreHandlers";
import { PermissionPreHandlers } from "../../../../auth/PermissionPreHandlers";
import { NotificationDestinationStore } from "../../../../database/NotificationDestinationStore";
import { HTTP404Error } from "../../../../errors/TreatedError";
import { defineRoute } from "../../../../routing/DefineRoute";
import { NotificationDestinationRuntime } from "../../../../services/NotificationDestinationRuntime";

const NotificationDestinationTestResultSchema = z.object({
    id: z.string(),
    ok: z.boolean(),
    error: z.string().optional()
});

export const POST = defineRoute({
    preHandler: [
        AuthPreHandlers.authorizedLocalOrApiKey,
        LeaderPreHandlers.requireLeader(),
        PermissionPreHandlers.requirePermission("notifications:write")
    ],

    schema: {
        summary: "Test notification destination",
        description: "Sends a synthetic pipeline notification to a single destination.",
        tags: ["notifications"],
        operationId: "testNotificationDestination",
        params: IdParamsSchema,
        response: {
            200: NotificationDestinationTestResultSchema
        }
    },

    async handler(req) {
        const destination = await NotificationDestinationStore.getById(req.params.id);

        if (!destination) {
            throw new HTTP404Error(`Notification destination ${req.params.id} not found.`, {
                error: "not_found"
            });
        }

        return NotificationDestinationRuntime.sendTest(destination);
    }
});
