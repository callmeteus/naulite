import type { FastifyInstance } from "fastify";

import { registerApiKeyRoutes } from "./api-keys";
import { registerClusterRoutes } from "./cluster";
import { registerHealthRoutes } from "./health";

/**
 * Registers all admin API HTTP routes.
 *
 * @param app Fastify application instance
 * @returns Nothing.
 */
export async function registerRoutes(app: FastifyInstance): Promise<void> {
    await registerHealthRoutes(app);
    await registerClusterRoutes(app);
    await registerApiKeyRoutes(app);
}
