import type { FastifyRequest, preHandlerHookHandler } from "fastify";

import { isLocalBootstrapRequest } from "../bootstrap/BootstrapUrls";
import { ControlPlaneService } from "../ControlPlaneService";
import { HTTP401Error, HTTP403Error } from "../errors/TreatedError";

const DEFAULT_AGENT_SETUP_KEY_SECRET = "netbird/setup-key";

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
     * Builds a route preHandler that validates API key authentication.
     *
     * @param options Authorization options
     * @returns Fastify preHandler
     */
    export function checkAuthorized(options: CheckAuthorizedOptions = {}): preHandlerHookHandler {
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
    export function checkAgentSetupKey(secretName = DEFAULT_AGENT_SETUP_KEY_SECRET): preHandlerHookHandler {
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
     * Validates API key authentication or throws 401.
     *
     * @param request Incoming Fastify request
     * @param options Authorization options
     * @returns Nothing.
     */
    export async function enforceAuthorization(
        request: FastifyRequest,
        options: CheckAuthorizedOptions = {}
    ): Promise<void> {
        if (options.allowLocalBootstrapRequest && isLocalBootstrapRequest(request)) {
            return;
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
    }
}
