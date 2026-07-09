import type { NauliteClient, AdminUser } from "@naulite/sdk";

declare module "fastify" {
    interface FastifyInstance {
        controlPlane: NauliteClient;
    }

    interface FastifyRequest {
        adminUser?: AdminUser;
        sessionToken?: string;
    }
}
