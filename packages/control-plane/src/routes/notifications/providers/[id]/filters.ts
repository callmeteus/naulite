import { z } from "zod";

import { PipelineEventKindSchema } from "@naulite/shared";

import { PermissionPreHandlers } from "../../../../auth/PermissionPreHandlers";
import { NotificationProviderFilterStore } from "../../../../database/NotificationProviderFilterStore";
import { HTTP404Error } from "../../../../errors/TreatedError";
import { defineRoute } from "../../../../routing/DefineRoute";
import { RunNotificationDispatcher } from "../../../../services/RunNotificationDispatcher";

const ProviderIdParamsSchema = z.object({
    id: z.string().min(1)
});

const NotificationProviderFiltersResponseSchema = z.object({
    providerId: z.string(),
    allowedKinds: z.array(PipelineEventKindSchema)
});

const UpdateNotificationProviderFiltersBodySchema = z.object({
    allowedKinds: z.array(PipelineEventKindSchema)
});

export const GET = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("notifications:read"),
    schema: {
        summary: "Get notification provider filters",
        description: "Returns allowed pipeline event kinds for a notification provider.",
        tags: ["notifications"],
        operationId: "getNotificationProviderFilters",
        params: ProviderIdParamsSchema,
        response: {
            200: NotificationProviderFiltersResponseSchema
        }
    },

    async handler(req) {
        const { id } = req.params;

        if (!RunNotificationDispatcher.listIds().includes(id)) {
            throw new HTTP404Error(`Notification provider ${id} not found.`, {
                error: "not_found"
            });
        }

        const allowedKinds = await NotificationProviderFilterStore.getAllowedKinds(id);

        return {
            providerId: id,
            allowedKinds: allowedKinds ?? []
        };
    }
});

export const PATCH = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("notifications:write"),
    schema: {
        summary: "Update notification provider filters",
        description: "Sets allowed pipeline event kinds for a notification provider.",
        tags: ["notifications"],
        operationId: "updateNotificationProviderFilters",
        params: ProviderIdParamsSchema,
        body: UpdateNotificationProviderFiltersBodySchema,
        response: {
            200: NotificationProviderFiltersResponseSchema
        }
    },

    async handler(req) {
        const { id } = req.params;
        const { allowedKinds } = req.body;

        if (!RunNotificationDispatcher.listIds().includes(id)) {
            throw new HTTP404Error(`Notification provider ${id} not found.`, {
                error: "not_found"
            });
        }

        await NotificationProviderFilterStore.setAllowedKinds(id, allowedKinds);

        return {
            providerId: id,
            allowedKinds
        };
    }
});
