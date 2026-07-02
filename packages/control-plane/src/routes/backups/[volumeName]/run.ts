import { z } from "zod";

import { AgentProxyService } from "../../../services/AgentProxyService";
import { AgentProxyRouteHelpers } from "../../../services/AgentProxyRouteHelpers";
import { ControlPlaneService } from "../../../ControlPlaneService";
import { defineRoute } from "../../../routing/DefineRoute";

export const POST = defineRoute({
    async handler(req, res) {
        const routeParams = z.object({
            volumeName: z.string().min(1)
        }).parse(req.params);

        const volumes = await ControlPlaneService.Store.listVolumes();
        const volume = volumes.find((entry) => entry.name === routeParams.volumeName);

        if (!volume) {
            return res.status(404).send({
                error: "not_found",
                message: `Volume ${routeParams.volumeName} não encontrado.`
            });
        }

        const nodes = await ControlPlaneService.Store.listNodes();
        const node = nodes.find((entry) => entry.id === volume.nodeId) ?? nodes[0];

        if (!node?.agentUrl) {
            return res.status(503).send({
                error: "agent_unavailable",
                message: "Nenhum agente disponível para executar backup."
            });
        }

        const run = await ControlPlaneService.Store.enqueueBackupRun(routeParams.volumeName);

        try {
            await AgentProxyService.postTask(node.agentUrl, "/tasks/backup", {
                taskId: run.id,
                volumeName: routeParams.volumeName
            });
        } catch (err) {
            return AgentProxyRouteHelpers.respond(res, err);
        }

        return run;
    }
});
