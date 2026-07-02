import type { PlatformClient } from "@platform/sdk";

declare module "fastify" {
    interface FastifyInstance {
        controlPlane: PlatformClient;
    }
}
