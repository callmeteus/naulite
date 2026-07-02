import { z } from "zod";

import { ApplyService } from "../../../services/ApplyService";
import { ControlPlaneService } from "../../../ControlPlaneService";
import { defineRoute } from "../../../routing/DefineRoute";

export const POST = defineRoute({
    async handler(req, res) {
        const routeParams = z.object({
            revisionId: z.string().min(1)
        }).parse(req.params);

        const revision = await ControlPlaneService.GitOps.getRevision(routeParams.revisionId);

        if (!revision) {
            return res.status(404).send({
                error: "not_found",
                message: `Revisão ${routeParams.revisionId} não encontrada.`
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
