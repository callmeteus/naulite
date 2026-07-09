import { z } from "zod";

import { SecretSchema, UpsertSecretBodySchema } from "@naulite/shared";

import { ControlPlaneService } from "../ControlPlaneService";
import { LeaderPreHandlers } from "../auth/LeaderPreHandlers";
import { PermissionPreHandlers } from "../auth/PermissionPreHandlers";
import { HTTP400Error } from "../errors/TreatedError";
import { defineRoute } from "../routing/DefineRoute";

export const GET = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("secrets:read"),
    schema: {
        summary: "List secrets",
        description: "Lists secret metadata stored in the cluster.",
        tags: ["secrets"],
        operationId: "listSecrets",
        response: {
            200: z.array(SecretSchema)
        }
    },

    async handler() {
        return ControlPlaneService.Secrets.list();
    }
});

export const POST = defineRoute({
    preHandler: [
        ...PermissionPreHandlers.authorizedWithPermission("secrets:write"),
        LeaderPreHandlers.requireLeader()
    ],

    schema: {
        summary: "Create secret",
        description: "Creates a cluster secret with encrypted values at rest.",
        tags: ["secrets"],
        operationId: "createSecret",
        body: UpsertSecretBodySchema,
        response: {
            200: SecretSchema
        }
    },

    async handler(req) {
        const body = req.body;

        if (!body.name) {
            throw new HTTP400Error("Secret name is required.", {
                error: "validation_error"
            });
        }

        return ControlPlaneService.Secrets.upsert({
            name: body.name,
            data: body.data,
            scope: body.scope,
            serviceName: body.serviceName,
            description: body.description
        });
    }
});
