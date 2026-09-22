import type { FastifyInstance } from "fastify";

import { registerAdminUserRoutes } from "./admin/users";
import { registerApiKeyRoutes } from "./api-keys";
import { registerAuthRoutes } from "./auth";
import { registerBackupRoutes } from "./backups";
import { registerBuildRoutes } from "./build";
import { registerClusterRoutes } from "./cluster";
import { registerContainerRegistryRoutes } from "./cr";
import { registerGatewayRoutes } from "./gateway";
import { registerHealthRoutes } from "./health";
import { registerMetricsRoutes } from "./metrics";
import { registerNetBirdRoutes } from "./netbird";
import { registerNodeProvisionRoutes } from "./nodes-provision";
import { registerNotificationRoutes } from "./notifications";
import { registerRunsRoutes } from "./runs";
import { registerSecretRoutes } from "./secrets";
import { registerTargetGroupRoutes } from "./TargetGroups";
import { registerSandboxRoutes } from "./Sandboxes";

/**
 * Registers all admin API HTTP routes.
 *
 * @param app Fastify application instance
 * @returns Nothing.
 */
export async function registerRoutes(app: FastifyInstance): Promise<void> {
    await registerHealthRoutes(app);
    await registerAuthRoutes(app);
    await registerClusterRoutes(app);
    await registerApiKeyRoutes(app);
    await registerSecretRoutes(app);
    await registerTargetGroupRoutes(app);
    await registerSandboxRoutes(app);
    await registerBackupRoutes(app);
    await registerNetBirdRoutes(app);
    await registerMetricsRoutes(app);
    await registerBuildRoutes(app);
    await registerContainerRegistryRoutes(app);
    await registerGatewayRoutes(app);
    await registerNodeProvisionRoutes(app);
    await registerRunsRoutes(app);
    await registerNotificationRoutes(app);
    await registerAdminUserRoutes(app);
}
