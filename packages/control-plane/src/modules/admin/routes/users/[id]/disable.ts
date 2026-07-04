import { z } from "zod";

import { PermissionPreHandlers } from "../../../../../auth/PermissionPreHandlers";
import { HTTP404Error } from "../../../../../errors/TreatedError";
import { defineRoute } from "../../../../../routing/DefineRoute";
import { AdminService } from "../../../AdminService";

const DisableParamsSchema = z.object({
    id: z.string().min(1)
});

const DisableBodySchema = z.object({
    reason: z.string().optional()
});

const AdminUserPublicSchema = z.object({
    id: z.string().min(1),
    username: z.string().min(1),
    role: z.enum(["viewer", "operator", "admin"]),
    tenantId: z.string().nullable(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1)
});

/**
 * Disables an admin user.
 */
export const POST = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("admin:users:write"),
    schema: {
        summary: "Disable admin user",
        description: "Disables an admin user and revokes active sessions.",
        tags: ["admin"],
        operationId: "disableAdminUser",
        params: DisableParamsSchema,
        body: DisableBodySchema,
        response: {
            200: AdminUserPublicSchema,
            404: z.object({ message: z.string() })
        }
    },
    async handler(req) {
        const disabled = await AdminService.disableUser(req.params.id);

        if (!disabled) {
            throw new HTTP404Error("Admin user not found.", { id: req.params.id });
        }

        return disabled;
    }
});
