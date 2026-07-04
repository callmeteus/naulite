import { z } from "zod";

import { PermissionPreHandlers } from "../../../auth/PermissionPreHandlers";
import { HTTP400Error } from "../../../errors/TreatedError";
import { defineRoute } from "../../../routing/DefineRoute";
import { AdminService } from "../AdminService";

const AdminUserPublicSchema = z.object({
    id: z.string().min(1),
    username: z.string().min(1),
    role: z.enum(["viewer", "operator", "admin"]),
    tenantId: z.string().nullable(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1)
});

const CreateAdminUserBodySchema = z.object({
    username: z.string().email().optional(),
    email: z.string().email().optional(),
    password: z.string().min(8).max(256),
    role: z.enum(["viewer", "operator", "admin"])
});

/**
 * Lists admin users.
 */
export const GET = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("admin:users:read"),
    schema: {
        summary: "List admin users",
        description: "Lists admin panel users.",
        tags: ["admin"],
        operationId: "listAdminUsers",
        response: {
            200: z.array(AdminUserPublicSchema)
        }
    },
    async handler() {
        return AdminService.listUsers();
    }
});

/**
 * Creates an admin user.
 */
export const POST = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("admin:users:write"),
    schema: {
        summary: "Create admin user",
        description: "Creates a new admin panel user.",
        tags: ["admin"],
        operationId: "createAdminUser",
        body: CreateAdminUserBodySchema,
        response: {
            200: AdminUserPublicSchema
        }
    },
    async handler(req) {
        const username = (req.body.email ?? req.body.username ?? "").trim().toLowerCase();

        if (!username) {
            throw new HTTP400Error("username or email is required.");
        }

        try {
            return await AdminService.createUser({
                username,
                password: req.body.password,
                role: req.body.role
            });
        } catch (err) {
            throw new HTTP400Error(err instanceof Error ? err.message : String(err));
        }
    }
});
