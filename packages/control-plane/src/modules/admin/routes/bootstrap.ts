import { z } from "zod";

import { isLocalBootstrapRequest } from "../../../bootstrap/BootstrapUrls";
import { HTTP400Error, HTTP403Error } from "../../../errors/TreatedError";
import { defineRoute } from "../../../routing/DefineRoute";
import { AdminService } from "../AdminService";

const BootstrapAdminBodySchema = z.object({
    username: z.string().min(1).max(120),
    password: z.string().min(8).max(256),
    role: z.enum(["viewer", "operator", "admin"]).optional()
});

const BootstrapAdminResponseSchema = z.object({
    user: z.object({
        id: z.string().min(1),
        username: z.string().min(1),
        role: z.enum(["viewer", "operator", "admin"]),
        tenantId: z.string().nullable(),
        createdAt: z.string().min(1),
        updatedAt: z.string().min(1)
    })
});

const BootstrapAdminConflictSchema = z.object({
    message: z.string()
});

export const POST = defineRoute({
    schema: {
        summary: "Bootstrap first admin user",
        description: "Creates the first admin user from loopback when no users exist.",
        tags: ["admin"],
        operationId: "bootstrapAdmin",
        body: BootstrapAdminBodySchema,
        response: {
            200: BootstrapAdminResponseSchema,
            403: BootstrapAdminConflictSchema,
            409: BootstrapAdminConflictSchema
        }
    },

    async handler(req) {
        if (!isLocalBootstrapRequest(req)) {
            throw new HTTP403Error("Forbidden.");
        }

        const userCount = await AdminService.countUsers();

        if (userCount > 0) {
            throw new HTTP400Error("Admin users already exist.");
        }

        const created = await AdminService.createBootstrapUser(req.body);

        if (!created) {
            throw new HTTP400Error("Admin users already exist.");
        }

        return { user: created };
    }
});
