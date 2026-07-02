import { z } from "zod";

import { AgentProxyService } from "../../../services/AgentProxyService";
import { AgentProxyRouteHelpers } from "../../../services/AgentProxyRouteHelpers";
import { ControlPlaneService } from "../../../ControlPlaneService";
import { defineRoute } from "../../../routing/DefineRoute";

export const POST = defineRoute({
    async handler(req, res) {
        const routeParams = z.object({
            backupId: z.string().min(1)
        }).parse(req.params);

        const runs = await ControlPlaneService.Store.listBackupRuns();
        const run = runs.find((entry) => entry.id === routeParams.backupId);

        if (!run) {
            return res.status(404).send({
                error: "not_found",
                message: `Backup ${routeParams.backupId} não encontrado.`
            });
        }

        const nodes = await ControlPlaneService.Store.listNodes();
        const node = nodes[0];

        if (!node?.agentUrl) {
            return res.status(503).send({
                error: "agent_unavailable",
                message: "Nenhum agente disponível para restaurar backup."
            });
        }

        try {
            return await AgentProxyService.postTask(node.agentUrl, "/backups/receive", {
                backupId: routeParams.backupId,
                volumeName: run.volumeName
            });
        } catch (err) {
            return AgentProxyRouteHelpers.respond(res, err);
        }
    }
});
