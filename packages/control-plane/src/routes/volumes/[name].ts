import {
    DeletedByNameResponseSchema,
    NameParamsSchema,
    RouteErrorResponseSchema
} from "@naulite/shared";
import { ControlPlaneService } from "../../ControlPlaneService";
import { PermissionPreHandlers } from "../../auth/PermissionPreHandlers";
import { defineRoute } from "../../routing/DefineRoute";

export const DELETE = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("workloads:write"),
    schema: {
        summary: "Delete volume",
        description: "Deletes a cluster volume by name.",
        tags: ["volumes"],
        operationId: "deleteVolumeByName",
        params: NameParamsSchema,
        response: {
            200: DeletedByNameResponseSchema,
            404: RouteErrorResponseSchema
        }
    },

    async handler(req, res) {
        const { name } = req.params;
        const deleted = await ControlPlaneService.Store.deleteVolumeByName(name);

        if (!deleted) {
            return res.status(404).send({
                error: "not_found",
                message: `Volume ${name} not found.`
            });
        }

        return { deleted: true, name };
    }
});
