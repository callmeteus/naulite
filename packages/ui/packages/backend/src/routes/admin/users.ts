import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { RolePreHandlers } from "../../auth/RolePreHandlers";

const CreateAdminUserBodySchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    role: z.enum(["viewer", "operator", "admin"])
});

const AdminUserIdParamsSchema = z.object({
    id: z.string().min(1)
});

const DisableAdminUserBodySchema = z.object({
    reason: z.string().optional()
});

const UpdateAdminUserBodySchema = z.object({
    email: z.string().email().optional(),
    role: z.enum(["viewer", "operator", "admin"]).optional(),
    password: z.string().min(8).optional()
});

/**
 * Registers admin user management routes proxied to the control plane.
 *
 * @param app Fastify application instance
 * @returns Nothing.
 */
export async function registerAdminUserRoutes(app: FastifyInstance): Promise<void> {
    const adminOnly = { preHandler: RolePreHandlers.requireRoles("admin") };

    app.get("/admin/users", adminOnly, async (request) => {
        const client = request.sessionToken
            ? app.controlPlane.withSession(request.sessionToken)
            : app.controlPlane;
        return client.listAdminUsers();
    });

    app.get("/admin/users/:id", adminOnly, async (request) => {
        const params = AdminUserIdParamsSchema.parse(request.params);
        const client = request.sessionToken
            ? app.controlPlane.withSession(request.sessionToken)
            : app.controlPlane;
        return client.getAdminUser(params.id);
    });

    app.post("/admin/users", adminOnly, async (request) => {
        const body = CreateAdminUserBodySchema.parse(request.body);
        const client = request.sessionToken
            ? app.controlPlane.withSession(request.sessionToken)
            : app.controlPlane;
        return client.createAdminUser(body);
    });

    app.patch("/admin/users/:id", adminOnly, async (request) => {
        const params = AdminUserIdParamsSchema.parse(request.params);
        const body = UpdateAdminUserBodySchema.parse(request.body);
        const client = request.sessionToken
            ? app.controlPlane.withSession(request.sessionToken)
            : app.controlPlane;
        return client.updateAdminUser(params.id, body);
    });

    app.post("/admin/users/:id/disable", adminOnly, async (request) => {
        const params = AdminUserIdParamsSchema.parse(request.params);
        const body = DisableAdminUserBodySchema.parse(request.body ?? {});
        const client = request.sessionToken
            ? app.controlPlane.withSession(request.sessionToken)
            : app.controlPlane;
        return client.disableAdminUser(params.id, body);
    });

    app.post("/admin/users/:id/enable", adminOnly, async (request) => {
        const params = AdminUserIdParamsSchema.parse(request.params);
        const client = request.sessionToken
            ? app.controlPlane.withSession(request.sessionToken)
            : app.controlPlane;
        return client.enableAdminUser(params.id);
    });
}
