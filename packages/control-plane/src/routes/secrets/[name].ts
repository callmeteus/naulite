import { ControlPlaneService } from "../../ControlPlaneService";
import { AuthPreHandlers } from "../../auth/AuthPreHandlers";
import { defineRoute } from "../../routing/DefineRoute";
import {
    DeletedByNameResponseSchema,
    NameParamsSchema,
    RouteErrorResponseSchema
} from "@platform/shared";

export const DELETE = defineRoute({
    preHandler: AuthPreHandlers.authorizedLocalOrApiKey,
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
        const deleted = await ControlPlaneService.Store.deleteSecretByName(name);

        if (!deleted) {
            return res.status(404).send({
                error: "not_found",
                message: `Secret ${name} not found.`
            });
        }

        return { deleted: true, name };
    }
});
