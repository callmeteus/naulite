import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";

import { isLocalBootstrapRequest } from "../bootstrap/BootstrapUrls";
import { ControlPlaneService } from "../ControlPlaneService";

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
     * Builds a route preHandler that validates API key authentication.
     *
     * @param options Authorization options
     * @returns Fastify preHandler
     */
    export function checkAuthorized(options: CheckAuthorizedOptions = {}): preHandlerHookHandler {
        return async (request, reply) => {
            await enforceAuthorization(request, reply, options);
        };
    }

    /**
     * Validates API key authentication or sends 401.
     *
     * @param request Incoming Fastify request
     * @param reply Fastify reply
     * @param options Authorization options
     * @returns Nothing.
     */
    export async function enforceAuthorization(
        request: FastifyRequest,
        reply: FastifyReply,
        options: CheckAuthorizedOptions = {}
    ): Promise<void> {
        if (options.allowLocalBootstrapRequest && isLocalBootstrapRequest(request)) {
            return;
        }

        const authHeader = request.headers.authorization;

        if (!authHeader?.startsWith("Bearer ")) {
            reply.code(401);
            await reply.send({ message: "Unauthorized." });
            return;
        }

        const secret = authHeader.slice("Bearer ".length).trim();
        const valid = await ControlPlaneService.Store.validateApiKey(secret);

        if (!valid) {
            reply.code(401);
            await reply.send({ message: "Unauthorized." });
        }
    }
}
