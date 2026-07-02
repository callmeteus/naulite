import type { FastifyInstance } from "fastify";

import { registerApplyRoutes } from "./apply.js";
import { registerApiKeyRoutes } from "./api-keys.js";
import { registerClusterRoutes } from "./cluster.js";
import { registerGitOpsRoutes } from "./gitops.js";
import { registerHealthRoutes } from "./health.js";
import { registerNetBirdRoutes } from "./netbird.js";
import { registerNodeRoutes } from "./nodes.js";
import { registerResourceRoutes } from "./resources.js";
import { registerWellKnownRoutes } from "./well-known.js";

/**
 * Registers all control plane HTTP routes.
 * 
 * @param app Fastify application instance
 * @returns Nothing.
 */
export async function registerRoutes(app: FastifyInstance): Promise<void> {
    await registerWellKnownRoutes(app);
    await registerHealthRoutes(app);
    await registerNodeRoutes(app);
    await registerClusterRoutes(app);
    await registerApplyRoutes(app);
    await registerResourceRoutes(app);
    await registerGitOpsRoutes(app);
    await registerNetBirdRoutes(app);
    await registerApiKeyRoutes(app);
}
