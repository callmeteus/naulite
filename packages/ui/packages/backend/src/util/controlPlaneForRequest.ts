import type { PlatformClient } from "@platform/sdk";
import type { FastifyInstance, FastifyRequest } from "fastify";

/**
 * Returns a control plane client scoped to the current request session.
 *
 * @param app Fastify application instance
 * @param request Incoming Fastify request
 * @returns Session-aware platform client
 */
export function controlPlaneForRequest(app: FastifyInstance, request: FastifyRequest): PlatformClient {
    if (request.sessionToken) {
        return app.controlPlane.withSession(request.sessionToken);
    }

    return app.controlPlane;
}
