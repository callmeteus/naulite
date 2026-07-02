import { z } from "zod";

import { ManifestNameQuerySchema, VolumeSchema } from "@platform/shared";
import { ControlPlaneService } from "../ControlPlaneService";
import { AuthPreHandlers } from "../auth/AuthPreHandlers";
import { defineRoute } from "../routing/DefineRoute";

export const GET = defineRoute({
    preHandler: AuthPreHandlers.authorizedLocalOrApiKey,
    schema: {
        summary: "List volumes",
        description: "Lists volumes registered in the cluster, with an optional manifest filter.",
        tags: ["volumes"],
        operationId: "listVolumes",
        querystring: ManifestNameQuerySchema,
        response: {
            200: z.array(VolumeSchema)
        }
    },
    async handler(req) {
        const { manifestName } = req.query;
        return (await ControlPlaneService.Store.listVolumes())
            .filter((volume) => !manifestName || volume.manifestName === manifestName);
    }
});
