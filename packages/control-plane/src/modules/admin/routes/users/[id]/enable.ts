import { z } from "zod";

import { PermissionPreHandlers } from "../../../../../auth/PermissionPreHandlers";
import { HTTP404Error } from "../../../../../errors/TreatedError";
import { defineRoute } from "../../../../../routing/DefineRoute";
import { AdminService } from "../../../AdminService";

const EnableParamsSchema = z.object({
    id: z.string().min(1)
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
 * Re-enables a disabled admin user.
 */
export const POST = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("admin:users:write"),
    schema: {
        summary: "Enable admin user",
        description: "Re-enables a previously disabled admin user.",
        tags: ["admin"],
        operationId: "enableAdminUser",
        params: EnableParamsSchema,
        response: {
            200: AdminUserPublicSchema,
            404: z.object({ message: z.string() })
        }
    },

    async handler(req) {
        const enabled = await AdminService.enableUser(req.params.id);

        if (!enabled) {
            throw new HTTP404Error("Admin user not found.", { id: req.params.id });
        }

        return enabled;
    }
});
