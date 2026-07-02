import { AgentProxyService } from "../../../services/AgentProxyService";
import { AgentProxyRouteHelpers } from "../../../services/AgentProxyRouteHelpers";
import { ControlPlaneService } from "../../../ControlPlaneService";
import { AuthPreHandlers } from "../../../auth/AuthPreHandlers";
import { defineRoute } from "../../../routing/DefineRoute";
import {
    EnqueuedBackupRunSchema,
    RouteErrorResponseSchema,
    VolumeNameParamsSchema
} from "@platform/shared";

export const POST = defineRoute({
    preHandler: AuthPreHandlers.authorizedLocalOrApiKey,
    schema: {
        summary: "Run volume backup",
        description: "Enqueues and dispatches a backup for the given volume to the responsible agent.",
        tags: ["backups"],
        operationId: "runVolumeBackup",
        params: VolumeNameParamsSchema,
        response: {
            200: EnqueuedBackupRunSchema,
            404: RouteErrorResponseSchema,
            503: RouteErrorResponseSchema
        }
    },
    async handler(req, res) {
        const { volumeName } = req.params;
        const volumes = await ControlPlaneService.Store.listVolumes();
        const volume = volumes.find((entry) => entry.name === volumeName);

        if (!volume) {
            return res.status(404).send({
                error: "not_found",
                message: `Volume ${volumeName} not found.`
            });
        }

        const nodes = await ControlPlaneService.Store.listNodes();
        const node = nodes.find((entry) => entry.id === volume.nodeId) ?? nodes[0];

        if (!node?.agentUrl) {
            return res.status(503).send({
                error: "agent_unavailable",
                message: "No agent is available to run the backup."
            });
        }

        const run = await ControlPlaneService.Store.enqueueBackupRun(volumeName);

        try {
            await AgentProxyService.postTask(node.agentUrl, "/tasks/backup", {
                taskId: run.id,
                volumeName
            });
        } catch (err) {
            return AgentProxyRouteHelpers.respond(res, err);
        }

        return run;
    }
});
