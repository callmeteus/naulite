import type { FastifyInstance } from "fastify";

import { registerApiKeyRoutes } from "./api-keys";
import { registerBackupRoutes } from "./backups";
import { registerBuildRoutes } from "./build";
import { registerClusterRoutes } from "./cluster";
import { registerContainerRegistryRoutes } from "./cr";
import { registerHealthRoutes } from "./health";
import { registerMetricsRoutes } from "./metrics";
import { registerNetBirdRoutes } from "./netbird";
import { registerNodeProvisionRoutes } from "./nodes-provision";
import { registerSecretRoutes } from "./secrets";

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
    await registerSecretRoutes(app);
    await registerBackupRoutes(app);
    await registerNetBirdRoutes(app);
    await registerMetricsRoutes(app);
    await registerBuildRoutes(app);
    await registerContainerRegistryRoutes(app);
    await registerNodeProvisionRoutes(app);
}
