import { ControlPlaneService } from "../../ControlPlaneService";
import { AuthPreHandlers } from "../../auth/AuthPreHandlers";
import { defineRoute } from "../../routing/DefineRoute";
import {
    GitOpsRevisionListResponseSchema,
    ManifestNameQuerySchema
} from "@platform/shared";

export const GET = defineRoute({
    preHandler: AuthPreHandlers.authorizedLocalOrApiKey,
    schema: {
        summary: "List GitOps revisions",
        description: "Lists applied manifest revisions with an optional manifest name filter.",
        tags: ["gitops"],
        operationId: "listGitOpsRevisions",
        querystring: ManifestNameQuerySchema,
        response: {
            200: GitOpsRevisionListResponseSchema
        }
    },
    async handler(req) {
        const { manifestName } = req.query;

        return {
            revisions: await ControlPlaneService.GitOps.listRevisions(manifestName)
        };
    }
});
