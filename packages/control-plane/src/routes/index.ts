import type { FastifyInstance } from "fastify";

import { registerApplyRoutes } from "./apply";
import { registerApiKeyRoutes } from "./api-keys";
import { registerBackupRoutes } from "./backups";
import { registerBuildRoutes } from "./build";
import { registerClusterRoutes } from "./cluster";
import { registerGitOpsRoutes } from "./gitops";
import { registerHealthRoutes } from "./health";
import { registerIngressRoutes } from "./ingress";
import { registerInstanceRoutes } from "./instances";
import { registerLogRotationRoutes } from "./log-rotation";
import { registerNetBirdRoutes } from "./netbird";
import { registerNodeRoutes } from "./nodes";
import { registerResourceRoutes } from "./resources";
import { registerWellKnownRoutes } from "./well-known";

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
    await registerInstanceRoutes(app);
    await registerResourceRoutes(app);
    await registerBackupRoutes(app);
    await registerBuildRoutes(app);
    await registerIngressRoutes(app);
    await registerLogRotationRoutes(app);
    await registerGitOpsRoutes(app);
    await registerNetBirdRoutes(app);
    await registerApiKeyRoutes(app);
}
