import {
    DeletedByNameResponseSchema,
    NameParamsSchema,
    RouteErrorResponseSchema,
    SecretSchema,
    UpsertSecretBodySchema
} from "@naulite/shared";

import { ControlPlaneService } from "../../ControlPlaneService";
import { LeaderPreHandlers } from "../../auth/LeaderPreHandlers";
import { PermissionPreHandlers } from "../../auth/PermissionPreHandlers";
import { HTTP404Error } from "../../errors/TreatedError";
import { defineRoute } from "../../routing/DefineRoute";

export const GET = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("secrets:read"),
    schema: {
        summary: "Get secret metadata",
        description: "Returns secret metadata by name without exposing secret values.",
        tags: ["secrets"],
        operationId: "getSecretByName",
        params: NameParamsSchema,
        response: {
            200: SecretSchema,
            404: RouteErrorResponseSchema
        }
    },

    async handler(req) {
        const { name } = req.params;
        const secret = await ControlPlaneService.Secrets.getByName(name);

        if (!secret) {
            throw new HTTP404Error(`Secret ${name} not found.`, {
                error: "not_found"
            });
        }

        return secret;
    }
});

export const PUT = defineRoute({
    preHandler: [
        ...PermissionPreHandlers.authorizedWithPermission("secrets:write"),
        LeaderPreHandlers.requireLeader()
    ],

    schema: {
        summary: "Update secret",
        description: "Updates a cluster secret with encrypted values at rest.",
        tags: ["secrets"],
        operationId: "updateSecretByName",
        params: NameParamsSchema,
        body: UpsertSecretBodySchema,
        response: {
            200: SecretSchema,
            404: RouteErrorResponseSchema
        }
    },

    async handler(req) {
        const { name } = req.params;
        const existing = await ControlPlaneService.Secrets.getByName(name);

        if (!existing) {
            throw new HTTP404Error(`Secret ${name} not found.`, {
                error: "not_found"
            });
        }

        const body = req.body;
        return ControlPlaneService.Secrets.upsert({
            name,
            data: body.data,
            scope: body.scope ?? existing.scope,
            serviceName: body.serviceName ?? existing.serviceName,
            description: body.description ?? existing.description
        });
    }
});

export const DELETE = defineRoute({
    preHandler: [
        ...PermissionPreHandlers.authorizedWithPermission("secrets:write"),
        LeaderPreHandlers.requireLeader()
    ],

    schema: {
        summary: "Delete secret",
        description: "Deletes a cluster secret by name.",
        tags: ["secrets"],
        operationId: "deleteSecretByName",
        params: NameParamsSchema,
        response: {
            200: DeletedByNameResponseSchema,
            404: RouteErrorResponseSchema
        }
    },

    async handler(req, res) {
        const { name } = req.params;
        const deleted = await ControlPlaneService.Secrets.deleteByName(name);

        if (!deleted) {
            return res.status(404).send({
                error: "not_found",
                message: `Secret ${name} not found.`
            });
        }

        return { deleted: true, name };
    }
});
