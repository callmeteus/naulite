import { z } from "zod";

import { defineRoute } from "../../../routing/DefineRoute";
import { HTTP401Error } from "../../../errors/TreatedError";
import { AdminService } from "../AdminService";

const AdminLoginBodySchema = z.object({
    username: z.string().min(1).max(120).optional(),
    email: z.string().email().optional(),
    password: z.string().min(1).max(256)
}).refine((body) => Boolean(body.username?.trim() || body.email?.trim()), {
    message: "username or email is required"
});

const AdminLoginResponseSchema = z.object({
    sessionToken: z.string().min(1),
    expiresAt: z.string().min(1),
    user: z.object({
        id: z.string().min(1),
        username: z.string().min(1),
        role: z.enum(["viewer", "operator", "admin"]),
        tenantId: z.string().nullable(),
        createdAt: z.string().min(1),
        updatedAt: z.string().min(1)
    })
});

const AdminLoginUnauthorizedSchema = z.object({
    message: z.string()
});

export const POST = defineRoute({
    schema: {
        summary: "Admin login",
        description: "Authenticates an admin user and returns a session token.",
        tags: ["admin"],
        operationId: "adminLogin",
        body: AdminLoginBodySchema,
        response: {
            200: AdminLoginResponseSchema,
            401: AdminLoginUnauthorizedSchema
        }
    },
    async handler(req) {
        const username = (req.body.email ?? req.body.username ?? "").trim();
        const result = await AdminService.login(username, req.body.password);

        if (!result) {
            throw new HTTP401Error("Invalid username or password.");
        }

        return result;
    }
});
