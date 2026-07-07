import {
    CreateNotificationDestinationBodySchema,
    NotificationDestinationSchema,
    NotificationDestinationsResponseSchema
} from "@naulite/shared";

import { PermissionPreHandlers } from "../../auth/PermissionPreHandlers";
import { NotificationDestinationStore } from "../../database/NotificationDestinationStore";
import { NotificationDestinationRuntime } from "../../services/NotificationDestinationRuntime";
import { defineRoute } from "../../routing/DefineRoute";

export const GET = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("notifications:read"),
    schema: {
        summary: "List notification destinations",
        description: "Lists notification destinations configured through the admin panel.",
        tags: ["notifications"],
        operationId: "listNotificationDestinations",
        response: {
            200: NotificationDestinationsResponseSchema
        }
    },
    async handler() {
        return {
            destinations: await NotificationDestinationStore.list()
        };
    }
});

export const POST = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("notifications:write"),
    schema: {
        summary: "Create notification destination",
        description: "Creates a Slack or webhook notification destination.",
        tags: ["notifications"],
        operationId: "createNotificationDestination",
        body: CreateNotificationDestinationBodySchema,
        response: {
            200: NotificationDestinationSchema
        }
    },
    async handler(req) {
        const destination = await NotificationDestinationStore.create(req.body);
        await NotificationDestinationRuntime.syncFromDatabase();
        return destination;
    }
});
