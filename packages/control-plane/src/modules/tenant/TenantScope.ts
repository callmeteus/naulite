import type { FastifyRequest, preHandlerHookHandler } from "fastify";
import type { WhereOptions } from "sequelize";

import { HTTP400Error } from "../../errors/TreatedError";

import { TenantConfig } from "./TenantConfig";

/**
 * Tenant query scoping helpers for multi-tenant deployments.
 */
export namespace TenantScope {
    /**
     * Merges tenant scoping into a Sequelize where clause when enabled.
     *
     * @param where Base where clause
     * @param tenantId Active tenant identifier
     * @returns Scoped where clause
     */
    export function applyTenantFilter<T extends WhereOptions>(
        where: T,
        tenantId: string | null | undefined
    ): T {
        if (!TenantConfig.isEnabled()) {
            return where;
        }

        if (!tenantId) {
            return where;
        }

        return {
            ...where,
            tenantId
        };
    }

    /**
     * Resolves the tenant id for a request when multi-tenant mode is enabled.
     *
     * @param request Incoming Fastify request
     * @returns Tenant id or null
     */
    export function resolveTenantId(request: FastifyRequest): string | null {
        if (request.tenantId) {
            return request.tenantId;
        }

        const header = request.headers["x-platform-tenant-id"];
        const tenantId = typeof header === "string" ? header.trim() : "";

        return tenantId || null;
    }

    /**
     * Fastify preHandler that requires a tenant id when multi-tenant mode is enabled.
     *
     * @returns Fastify preHandler
     */
    export function requireTenantId(): preHandlerHookHandler {
        return async (request) => {
            if (!TenantConfig.isEnabled()) {
                return;
            }

            const tenantId = resolveTenantId(request);

            if (!tenantId) {
                throw new HTTP400Error("Tenant id is required.");
            }

            request.tenantId = tenantId;
        };
    }
}
