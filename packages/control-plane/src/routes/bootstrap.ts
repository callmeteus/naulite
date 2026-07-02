import type { FastifyInstance } from "fastify";

import {
    isLocalBootstrapRequest,
    resolvePublicControlPlaneUrl,
    resolvePublicNetBirdManagementUrl
} from "./bootstrapUrls";

const SETUP_KEY_SECRET_NAME = "netbird/setup-key";

/**
 * Registers public agent bootstrap routes.
 *
 * @param app Fastify application instance
 * @returns Nothing.
 */
export async function registerBootstrapRoutes(app: FastifyInstance): Promise<void> {
    app.get("/bootstrap/agent", async (request, reply) => {
        const headerKey = request.headers["x-platform-setup-key"];
        const setupKey = typeof headerKey === "string" ? headerKey.trim() : "";

        if (!setupKey) {
            reply.code(401);
            return { message: "Missing setup key." };
        }

        const stored = await app.controlPlane.store.getClusterSecretValues(SETUP_KEY_SECRET_NAME);

        if (!stored?.key || stored.key !== setupKey) {
            reply.code(403);
            return { message: "Invalid setup key." };
        }

        const netbirdManagementUrl = resolvePublicNetBirdManagementUrl();

        if (!netbirdManagementUrl) {
            reply.code(503);
            return { message: "NetBird management URL is not configured." };
        }

        return {
            cpUrl: resolvePublicControlPlaneUrl(request),
            netbirdManagementUrl
        };
    });

    app.get("/bootstrap/setup-key", async (request, reply) => {
        if (!isLocalBootstrapRequest(request)) {
            reply.code(403);
            return { message: "Forbidden." };
        }

        const setupKey = await app.controlPlane.netBirdEnrollment.ensureSetupKey();

        return { setupKey };
    });
}
