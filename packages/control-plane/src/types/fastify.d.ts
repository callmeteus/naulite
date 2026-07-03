import "fastify";

import type { AdminRole, AdminUserPublic, RequestAuthMethod } from "../auth/AdminAuthTypes";

declare module "fastify" {
    interface FastifyRequest {
        rawBody?: Buffer;
        authMethod?: RequestAuthMethod;
        adminUser?: AdminUserPublic;
        role?: AdminRole;
        tenantId?: string | null;
    }
}
