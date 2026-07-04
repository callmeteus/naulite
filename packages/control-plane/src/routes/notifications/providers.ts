import { z } from "zod";

import { AuthPreHandlers } from "../../auth/AuthPreHandlers";
import { PermissionPreHandlers } from "../../auth/PermissionPreHandlers";
import { defineRoute } from "../../routing/DefineRoute";
import { NotificationProviderEnvStatus } from "../../services/NotificationProviderEnvStatus";
import { RunNotificationDispatcher } from "../../services/RunNotificationDispatcher";

const NotificationProviderStatusSchema = z.object({
    id: z.string(),
    type: z.literal("notification"),
    registered: z.boolean(),
    urlConfigured: z.boolean(),
    secretConfigured: z.boolean(),
    env: z.object({
        urlVars: z.array(z.string()),
        secretVars: z.array(z.string())
    })
});

const NotificationProvidersResponseSchema = z.object({
    providers: z.array(NotificationProviderStatusSchema)
});

export const GET = defineRoute({
    preHandler: [
        AuthPreHandlers.authorizedLocalOrApiKey,
        PermissionPreHandlers.requirePermission("notifications:write")
    ],
    schema: {
        summary: "List notification providers",
        description: "Lists registered notification providers and their environment configuration status.",
        tags: ["notifications"],
        operationId: "listNotificationProviders",
        response: {
            200: NotificationProvidersResponseSchema
        }
    },
    async handler() {
        return {
            providers: NotificationProviderEnvStatus.list(RunNotificationDispatcher.listIds())
        };
    }
});
