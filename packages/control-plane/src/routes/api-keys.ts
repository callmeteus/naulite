import type { FastifyInstance, FastifyRequest } from "fastify";
import { CreateApiKeyBodySchema } from "@platform/shared";

/**
 * Returns whether the request originated from the local control plane host.
 * 
 * @param request Incoming Fastify request
 * @returns Whether the caller is local loopback
 */
function isLocalRequest(request: FastifyRequest): boolean {
    const ip = request.ip;
    return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

/**
 * Registers API key management routes (internal - consumed by the admin API).
 * 
 * @param app Fastify application instance
 * @returns Nothing.
 */
export async function registerApiKeyRoutes(app: FastifyInstance): Promise<void> {
    app.get("/api-keys", async (request, reply) => {
        if (!isLocalRequest(request) && !request.headers.authorization?.startsWith("Bearer ")) {
            reply.code(401);
            return { message: "Unauthorized." };
        }

        return app.controlPlane.store.listApiKeys();
    });

    app.post("/api-keys", async (request) => {
        const body = CreateApiKeyBodySchema.parse(request.body);
        return app.controlPlane.store.createApiKey(body.name);
    });

    app.delete("/api-keys/:id", async (request, reply) => {
        if (!isLocalRequest(request) && !request.headers.authorization?.startsWith("Bearer ")) {
            reply.code(401);
            return { message: "Unauthorized." };
        }

        const params = request.params as { id: string };
        const revoked = await app.controlPlane.store.revokeApiKey(params.id);
        if (!revoked) {
            reply.code(404);
            return { message: "API key not found." };
        }

        return { revoked: true };
    });
}
