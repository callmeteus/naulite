import { ApplyService } from "../../../services/ApplyService";
import { ControlPlaneService } from "../../../ControlPlaneService";
import { PermissionPreHandlers } from "../../../auth/PermissionPreHandlers";
import { LeaderPreHandlers } from "../../../auth/LeaderPreHandlers";
import { defineRoute } from "../../../routing/DefineRoute";
import {
    LooseObjectSchema,
    RevisionIdParamsSchema,
    RouteErrorResponseSchema
} from "@naulite/shared";

export const POST = defineRoute({
    preHandler: [
        ...PermissionPreHandlers.authorizedWithPermission("gitops:rollback"),
        LeaderPreHandlers.requireLeader()
    ],
    schema: {
        summary: "Rollback GitOps revision",
        description: "Reapplies a previous manifest revision in the cluster.",
        tags: ["gitops"],
        operationId: "rollbackGitOpsRevision",
        params: RevisionIdParamsSchema,
        response: {
            200: LooseObjectSchema,
            404: RouteErrorResponseSchema
        }
    },
    async handler(req, res) {
        const { revisionId } = req.params;
        const revision = await ControlPlaneService.GitOps.getRevision(revisionId);

        if (!revision) {
            return res.status(404).send({
                error: "not_found",
                message: `Revision ${revisionId} not found.`
            });
        }

        const applyResult = await ApplyService.execute(revision.manifestYaml, {
            repositoryUrl: revision.repositoryUrl,
            branch: revision.branch,
            commitSha: revision.commitSha,
            rolledBackFromId: revision.id
        });

        return applyResult;
    }
});
