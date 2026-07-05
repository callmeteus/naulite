import { AgentProxyRouteHelpers } from "../../../services/AgentProxyRouteHelpers";
import { BackupCompletionService } from "../../../services/BackupCompletionService";
import { BackupDispatchService } from "../../../services/BackupDispatchService";
import { ControlPlaneService } from "../../../ControlPlaneService";
import { PermissionPreHandlers } from "../../../auth/PermissionPreHandlers";
import { defineRoute } from "../../../routing/DefineRoute";
import {
    EnqueuedBackupRunSchema,
    RouteErrorResponseSchema,
    VolumeNameParamsSchema
} from "@naulite/shared";

export const POST = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("backups:run"),
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
        const node = BackupDispatchService.resolveNodeForVolume(volume, nodes);

        if (!node?.agentUrl) {
            return res.status(503).send({
                error: "agent_unavailable",
                message: "No agent is available to run the backup."
            });
        }

        const run = await ControlPlaneService.Store.enqueueBackupRun(volumeName);
        const taskPayload = BackupDispatchService.buildTaskPayload(volume, run.id);

        let agentResponse: unknown;

        try {
            agentResponse = await BackupDispatchService.dispatchBackupTask(node, taskPayload);
        } catch (err) {
            return AgentProxyRouteHelpers.respond(res, err);
        }

        try {
            const result = await BackupCompletionService.completeRun(
                ControlPlaneService.requireContext().backupOrchestrator,
                taskPayload,
                agentResponse,
                { agentUrl: node.agentUrl }
            );

            return {
                ...run,
                status: "succeeded" as const,
                completedAt: new Date().toISOString(),
                destination: result.location
            };
        } catch (err) {
            return AgentProxyRouteHelpers.respond(res, err);
        }
    }
});
