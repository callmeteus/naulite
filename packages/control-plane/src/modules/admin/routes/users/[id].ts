import { z } from "zod";

import { PermissionPreHandlers } from "../../../../auth/PermissionPreHandlers";
import { HTTP400Error, HTTP404Error } from "../../../../errors/TreatedError";
import { defineRoute } from "../../../../routing/DefineRoute";
import { AdminService } from "../../AdminService";

const AdminUserParamsSchema = z.object({
    id: z.string().min(1)
});

const UpdateAdminUserBodySchema = z.object({
    role: z.enum(["viewer", "operator", "admin"]).optional(),
    password: z.string().min(8).max(256).optional(),
    email: z.string().email().optional(),
    username: z.string().email().optional()
});

const AdminUserPublicSchema = z.object({
    id: z.string().min(1),
    username: z.string().min(1),
    role: z.enum(["viewer", "operator", "admin"]),
    tenantId: z.string().nullable(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    disabledAt: z.string().nullable()
});

/**
 * Returns a single admin user by identifier.
 */
export const GET = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("admin:users:read"),
    schema: {
        summary: "Get admin user",
        description: "Returns a single admin panel user.",
        tags: ["admin"],
        operationId: "getAdminUser",
        params: AdminUserParamsSchema,
        response: {
            200: AdminUserPublicSchema,
            404: z.object({ message: z.string() })
        }
    },
    async handler(req) {
        const user = await AdminService.getUser(req.params.id);

        if (!user) {
            throw new HTTP404Error("Admin user not found.", { id: req.params.id });
        }

        return {
            id: user.id,
            username: user.username,
            role: user.role,
            tenantId: user.tenantId,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
            disabledAt: user.disabledAt
        };
    }
});

/**
 * Updates an admin user.
 */
export const PATCH = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("admin:users:write"),
    schema: {
        summary: "Update admin user",
        description: "Updates role, email, and optionally resets password for an admin user.",
        tags: ["admin"],
        operationId: "updateAdminUser",
        params: AdminUserParamsSchema,
        body: UpdateAdminUserBodySchema,
        response: {
            200: AdminUserPublicSchema,
            404: z.object({ message: z.string() })
        }
    },
    async handler(req) {
        const username = (req.body.email ?? req.body.username)?.trim().toLowerCase();

        if (!req.body.role && !req.body.password && !username) {
            throw new HTTP400Error("At least one of role, password, or email is required.");
        }

        try {
            const updated = await AdminService.updateUser(req.params.id, {
                role: req.body.role,
                password: req.body.password,
                username
            });

            if (!updated) {
                throw new HTTP404Error("Admin user not found.", { id: req.params.id });
            }

            return updated;
        } catch (err) {
            if (err instanceof HTTP404Error) {
                throw err;
            }

            throw new HTTP400Error(err instanceof Error ? err.message : String(err));
        }
    }
});
