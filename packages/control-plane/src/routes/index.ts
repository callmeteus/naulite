import type { FastifyInstance } from "fastify";

import { RouteFileLoader } from "../routing/RouteFileLoader";

/**
 * Registers all control plane HTTP routes discovered under `src/routes`.
 *
 * @param app Fastify application instance
 * @returns Nothing.
 */
export async function registerRoutes(app: FastifyInstance): Promise<void> {
    await RouteFileLoader.registerAll(app);
}
