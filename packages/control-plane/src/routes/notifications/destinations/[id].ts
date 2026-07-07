import {
    IdParamsSchema,
    NotificationDestinationSchema,
    UpdateNotificationDestinationBodySchema
} from "@naulite/shared";
import { z } from "zod";

import { PermissionPreHandlers } from "../../../auth/PermissionPreHandlers";
import { NotificationDestinationStore } from "../../../database/NotificationDestinationStore";
import { HTTP404Error } from "../../../errors/TreatedError";
import { defineRoute } from "../../../routing/DefineRoute";
import { NotificationDestinationRuntime } from "../../../services/NotificationDestinationRuntime";

const DeleteNotificationDestinationResponseSchema = z.object({
    id: z.string(),
    deleted: z.literal(true)
});

export const GET = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("notifications:read"),

    schema: {
        summary: "Get notification destination",
        description: "Returns a single notification destination.",
        tags: ["notifications"],
        operationId: "getNotificationDestination",
        params: IdParamsSchema,
        response: {
            200: NotificationDestinationSchema
        }
    },

    async handler(req) {
        const destination = await NotificationDestinationStore.getById(req.params.id);

        if (!destination) {
            throw new HTTP404Error(`Notification destination ${req.params.id} not found.`, {
                error: "not_found"
            });
        }

        return {
            id: destination.id,
            name: destination.name,
            type: destination.type,
            url: destination.url,
            secretConfigured: Boolean(destination.secret?.trim()),
            enabled: destination.enabled,
            allowedKinds: destination.allowedKinds,
            createdAt: destination.createdAt,
            updatedAt: destination.updatedAt
        };
    }
});

export const PATCH = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("notifications:write"),
    schema: {
        summary: "Update notification destination",
        description: "Updates a notification destination configured through the admin panel.",
        tags: ["notifications"],
        operationId: "updateNotificationDestination",
        params: IdParamsSchema,
        body: UpdateNotificationDestinationBodySchema,
        response: {
            200: NotificationDestinationSchema
        }
    },
    async handler(req) {
        const destination = await NotificationDestinationStore.update(req.params.id, req.body);
        await NotificationDestinationRuntime.syncFromDatabase();
        return destination;
    }
});

export const DELETE = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("notifications:write"),
    schema: {
        summary: "Delete notification destination",
        description: "Deletes a notification destination.",
        tags: ["notifications"],
        operationId: "deleteNotificationDestination",
        params: IdParamsSchema,
        response: {
            200: DeleteNotificationDestinationResponseSchema
        }
    },
    async handler(req) {
        const deleted = await NotificationDestinationStore.remove(req.params.id);

        if (!deleted) {
            throw new HTTP404Error(`Notification destination ${req.params.id} not found.`, {
                error: "not_found"
            });
        }

        await NotificationDestinationRuntime.syncFromDatabase();

        return {
            id: req.params.id,
            deleted: true as const
        };
    }
});
