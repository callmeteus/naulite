import { z } from "zod";

import { ControlPlaneService } from "../../ControlPlaneService";
import { defineRoute } from "../../routing/DefineRoute";

export const GET = defineRoute({
    async handler(req) {
        const query = z.object({
            manifestName: z.string().min(1).optional()
        }).parse(req.query);

        return {
            revisions: await ControlPlaneService.GitOps.listRevisions(query.manifestName)
        };
    }
});
