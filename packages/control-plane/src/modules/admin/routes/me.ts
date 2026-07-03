import { z } from "zod";

import { AuthPreHandlers } from "../../../auth/AuthPreHandlers";
import { defineRoute } from "../../../routing/DefineRoute";
import { HTTP401Error } from "../../../errors/TreatedError";

const AdminMeResponseSchema = z.object({
    user: z.object({
        id: z.string().min(1),
        username: z.string().min(1),
        role: z.enum(["viewer", "operator", "admin"]),
        tenantId: z.string().nullable(),
        createdAt: z.string().min(1),
        updatedAt: z.string().min(1)
    })
});

const AdminMeUnauthorizedSchema = z.object({
    message: z.string()
});

export const GET = defineRoute({
    preHandler: AuthPreHandlers.requireAdminSession,
    schema: {
        summary: "Current admin user",
        description: "Returns the authenticated admin user for the active session.",
        tags: ["admin"],
        operationId: "adminMe",
        response: {
            200: AdminMeResponseSchema,
            401: AdminMeUnauthorizedSchema
        }
    },
    async handler(req) {
        if (!req.adminUser) {
            throw new HTTP401Error("Unauthorized.");
        }

        return { user: req.adminUser };
    }
});
