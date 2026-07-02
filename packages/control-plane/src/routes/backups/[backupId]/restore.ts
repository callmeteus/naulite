import { AgentProxyService } from "../../../services/AgentProxyService";
import { AgentProxyRouteHelpers } from "../../../services/AgentProxyRouteHelpers";
import { ControlPlaneService } from "../../../ControlPlaneService";
import { AuthPreHandlers } from "../../../auth/AuthPreHandlers";
import { defineRoute } from "../../../routing/DefineRoute";
import {
    BackupIdParamsSchema,
    LooseObjectSchema,
    RouteErrorResponseSchema
} from "@platform/shared";

export const POST = defineRoute({
    preHandler: AuthPreHandlers.authorizedLocalOrApiKey,
    schema: {
        summary: "Restore backup",
        description: "Restores an existing backup on the associated volume.",
        tags: ["backups"],
        operationId: "restoreBackup",
        params: BackupIdParamsSchema,
        response: {
            200: LooseObjectSchema,
            404: RouteErrorResponseSchema,
            503: RouteErrorResponseSchema
        }
    },
    async handler(req, res) {
        const { backupId } = req.params;
        const runs = await ControlPlaneService.Store.listBackupRuns();
        const run = runs.find((entry) => entry.id === backupId);

        if (!run) {
            return res.status(404).send({
                error: "not_found",
                message: `Backup ${backupId} not found.`
            });
        }

        const nodes = await ControlPlaneService.Store.listNodes();
        const node = nodes[0];

        if (!node?.agentUrl) {
            return res.status(503).send({
                error: "agent_unavailable",
                message: "No agent is available to restore the backup."
            });
        }

        try {
            return await AgentProxyService.postTask(node.agentUrl, "/backups/receive", {
                backupId,
                volumeName: run.volumeName
            });
        } catch (err) {
            return AgentProxyRouteHelpers.respond(res, err);
        }
    }
});
