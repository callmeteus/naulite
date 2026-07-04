import type { FastifyRequest, preHandlerHookHandler } from "fastify";

import { isLocalBootstrapRequest } from "../bootstrap/BootstrapUrls";
import { ControlPlaneService } from "../ControlPlaneService";
import { HTTP401Error, HTTP403Error } from "../errors/TreatedError";
import { AdminService } from "../modules/admin/AdminService";
import { TenantScope } from "../modules/tenant/TenantScope";

import type { AdminRole } from "./AdminAuthTypes";
import { adminRoleMeetsMinimum } from "./AdminAuthTypes";
import { attachRequestAuth } from "./RequestAuth";

const SESSION_HEADER = "x-platform-session";

/**
 * Options for {@link AuthPreHandlers.checkAuthorized}.
 */
export interface CheckAuthorizedOptions {
    allowLocalBootstrapRequest?: boolean;
}

/**
 * Route-level authentication pre-handlers.
 */
export namespace AuthPreHandlers {
    /**
     * API key auth with local loopback bypass for bootstrap flows.
     */
    export const authorizedLocalOrApiKey = checkAuthorized({ allowLocalBootstrapRequest: true });

    /**
     * Requires a valid admin session token.
     */
    export const requireAdminSession = checkAuthorized({
        allowLocalBootstrapRequest: false,
        requireSession: true
    });

    /**
     * Builds a route preHandler that validates API key authentication.
     *
     * @param options Authorization options
     * @returns Fastify preHandler
     */
    export function checkAuthorized(
        options: CheckAuthorizedOptions & {
            requireSession?: boolean;
            minimumRole?: AdminRole;
        } = {}
    ): preHandlerHookHandler {
        return async (request) => {
            await enforceAuthorization(request, options);
        };
    }

    /**
     * Restricts a route to local loopback callers.
     *
     * @returns Fastify preHandler
     */
    export function requireLocalBootstrapRequest(): preHandlerHookHandler {
        return async (request) => {
            if (!isLocalBootstrapRequest(request)) {
                throw new HTTP403Error("Forbidden.");
            }
        };
    }

    /**
     * Validates the agent bootstrap setup key header.
     *
     * @param secretName Cluster secret name that stores the setup key
     * @returns Fastify preHandler
     */
    export function checkAgentSetupKey(secretName = "netbird/setup-key"): preHandlerHookHandler {
        return async (request) => {
            const headerKey = request.headers["x-platform-setup-key"];
            const setupKey = typeof headerKey === "string" ? headerKey.trim() : "";

            if (!setupKey) {
                throw new HTTP401Error("Missing setup key.");
            }

            const provisionHeader = request.headers["x-platform-provision-id"];
            const provisionId = typeof provisionHeader === "string" ? provisionHeader.trim() : "";

            if (provisionId) {
                const validProvisionKey = await ControlPlaneService.NodeProvision.validateProvisionSetupKey(
                    provisionId,
                    setupKey
                );

                if (validProvisionKey) {
                    return;
                }
            }

            const stored = await ControlPlaneService.Store.getClusterSecretValues(secretName);

            if (!stored?.key || stored.key !== setupKey) {
                throw new HTTP403Error("Invalid setup key.");
            }
        };
    }

    /**
     * Reads the admin session token from request headers.
     *
     * @param request Incoming Fastify request
     * @returns Session token when present
     */
    export function readSessionToken(request: FastifyRequest): string | null {
        const header = request.headers[SESSION_HEADER];
        const token = typeof header === "string" ? header.trim() : "";

        return token || null;
    }

    /**
     * Validates API key or session authentication or throws 401.
     *
     * @param request Incoming Fastify request
     * @param options Authorization options
     * @returns Nothing.
     */
    export async function enforceAuthorization(
        request: FastifyRequest,
        options: CheckAuthorizedOptions & {
            requireSession?: boolean;
            minimumRole?: AdminRole;
        } = {}
    ): Promise<void> {
        const sessionToken = readSessionToken(request);

        if (sessionToken) {
            const adminUser = await AdminService.resolveSession(sessionToken);

            if (!adminUser) {
                throw new HTTP401Error("Unauthorized.");
            }

            if (options.minimumRole && !adminRoleMeetsMinimum(adminUser.role, options.minimumRole)) {
                throw new HTTP403Error("Forbidden.");
            }

            attachRequestAuth(request, {
                authMethod: "session",
                adminUser,
                role: adminUser.role,
                tenantId: adminUser.tenantId
            });

            const scopedTenantId = TenantScope.resolveTenantId(request);

            if (scopedTenantId) {
                request.tenantId = scopedTenantId;
            }

            return;
        }

        if (options.allowLocalBootstrapRequest && isLocalBootstrapRequest(request)) {
            attachRequestAuth(request, {
                authMethod: "local",
                role: "admin",
                tenantId: null
            });
            return;
        }

        if (options.requireSession) {
            throw new HTTP401Error("Unauthorized.");
        }

        const authHeader = request.headers.authorization;

        if (!authHeader?.startsWith("Bearer ")) {
            throw new HTTP401Error("Unauthorized.");
        }

        const secret = authHeader.slice("Bearer ".length).trim();
        const valid = await ControlPlaneService.Store.validateApiKey(secret);

        if (!valid) {
            throw new HTTP401Error("Unauthorized.");
        }

        attachRequestAuth(request, {
            authMethod: "api_key",
            role: "admin",
            tenantId: TenantScope.resolveTenantId(request)
        });
    }
}
