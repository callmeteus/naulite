import type { NauliteClient } from "@naulite/sdk";

declare module "fastify" {
    interface FastifyInstance {
        controlPlane: NauliteClient;
    }

    interface FastifyRequest {
        adminUser?: import("@naulite/sdk").AdminUser;
        sessionToken?: string;
    }
}
