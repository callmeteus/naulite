import { z } from "zod";

import { AuthPreHandlers } from "../../../auth/AuthPreHandlers";
import { defineRoute } from "../../../routing/DefineRoute";
import { HTTP401Error } from "../../../errors/TreatedError";
import { AdminService } from "../AdminService";

const AdminLogoutResponseSchema = z.object({
    revoked: z.literal(true)
});

const AdminLogoutUnauthorizedSchema = z.object({
    message: z.string()
});

export const POST = defineRoute({
    preHandler: AuthPreHandlers.requireAdminSession,
    schema: {
        summary: "Admin logout",
        description: "Revokes the active admin session token.",
        tags: ["admin"],
        operationId: "adminLogout",
        response: {
            200: AdminLogoutResponseSchema,
            401: AdminLogoutUnauthorizedSchema
        }
    },
    async handler(req) {
        const sessionToken = AuthPreHandlers.readSessionToken(req);

        if (!sessionToken) {
            throw new HTTP401Error("Missing session.");
        }

        const revoked = await AdminService.logout(sessionToken);

        if (!revoked) {
            throw new HTTP401Error("Invalid session.");
        }

        return { revoked: true };
    }
});
