import { AgentProxyRouteHelpers } from "../../../services/AgentProxyRouteHelpers";
import { BackupDispatchService } from "../../../services/BackupDispatchService";
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

        const [volumes, nodes] = await Promise.all([
            ControlPlaneService.Store.listVolumes(),
            ControlPlaneService.Store.listNodes()
        ]);
        const volume = volumes.find((entry) => entry.name === run.volumeName);
        const node = volume
            ? BackupDispatchService.resolveNodeForVolume(volume, nodes)
            : nodes.find((entry) => entry.agentUrl);

        if (!node?.agentUrl) {
            return res.status(503).send({
                error: "agent_unavailable",
                message: "No agent is available to restore the backup."
            });
        }

        try {
            const archivePath =
                typeof run.archivePath === "string" && run.archivePath.length > 0
                    ? run.archivePath
                    : undefined;

            return await BackupDispatchService.dispatchRestoreTask(node, {
                backupId,
                volumeName: run.volumeName,
                archivePath,
                mountPath: volume?.mountPath
            });
        } catch (err) {
            return AgentProxyRouteHelpers.respond(res, err);
        }
    }
});
