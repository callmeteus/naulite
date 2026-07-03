import type { PlatformClient } from "@platform/sdk";

declare module "fastify" {
    interface FastifyInstance {
        controlPlane: PlatformClient;
    }

    interface FastifyRequest {
        adminUser?: import("@platform/sdk").AdminUser;
        sessionToken?: string;
    }
}
