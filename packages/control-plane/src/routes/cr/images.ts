import { ControlPlaneService } from "../../ControlPlaneService";
import { AuthPreHandlers } from "../../auth/AuthPreHandlers";
import { defineRoute } from "../../routing/DefineRoute";
import { CrImageListResponseSchema } from "@platform/shared";

export const GET = defineRoute({
    preHandler: AuthPreHandlers.authorizedLocalOrApiKey,
    schema: {
        summary: "List container registry images",
        description: "Lists docker save tarballs stored in the platform container registry.",
        tags: ["container-registry"],
        operationId: "listContainerRegistryImages",
        response: {
            200: CrImageListResponseSchema
        }
    },
    async handler() {
        const images = await ControlPlaneService.ContainerRegistry.listImages();
        return { images };
    }
});
