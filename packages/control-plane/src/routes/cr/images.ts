import {
    ContainerRegistryImageSchema,
    PaginatedListSchema,
    PaginationQuerySchema
} from "@platform/shared";
import { ControlPlaneService } from "../../ControlPlaneService";
import { AuthPreHandlers } from "../../auth/AuthPreHandlers";
import { defineRoute } from "../../routing/DefineRoute";

export const GET = defineRoute({
    preHandler: AuthPreHandlers.authorizedLocalOrApiKey,
    schema: {
        summary: "List container registry images",
        description: "Lists docker save tarballs stored in the platform container registry.",
        tags: ["container-registry"],
        operationId: "listContainerRegistryImages",
        querystring: PaginationQuerySchema,
        response: {
            200: PaginatedListSchema(ContainerRegistryImageSchema)
        }
    },
    async handler(req) {
        return ControlPlaneService.ContainerRegistry.listImages(req.query);
    }
});
