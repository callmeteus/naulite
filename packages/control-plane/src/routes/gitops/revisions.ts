import { ControlPlaneService } from "../../ControlPlaneService";
import { PermissionPreHandlers } from "../../auth/PermissionPreHandlers";
import { defineRoute } from "../../routing/DefineRoute";
import {
    GitOpsRevisionListResponseSchema,
    ManifestNameQuerySchema
} from "@naulite/shared";

export const GET = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("gitops:read"),
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
