import type { BackupTask } from "@naulite/shared";

import { BackupRunModel } from "../database/models/index";
import type { BackupOrchestrator } from "../modules/backup/BackupOrchestrator";
import { BackupArchiveStagingService } from "./BackupArchiveStagingService";

/**
 * Parsed agent backup task response.
 */
interface ParsedAgentBackupResponse {
    archivePath: string;
    status: string;
    taskId: string;
}

/**
 * Completes backup runs after agent dispatch succeeds.
 */
export namespace BackupCompletionService {
    /**
     * Parses the agent backup response payload.
     *
     * @param agentResponse Raw agent response body
     * @returns Parsed archive path, status, and task id
     */
    export function parseAgentResponse(agentResponse: unknown): ParsedAgentBackupResponse {
        if (typeof agentResponse !== "object" || agentResponse === null) {
            throw new Error("Invalid agent backup response.");
        }

        const record = agentResponse as Record<string, unknown>;
        const archivePath = typeof record.archivePath === "string" ? record.archivePath : "";
        const status = typeof record.status === "string" ? record.status : "";
        const taskId = typeof record.taskId === "string" ? record.taskId : "";

        if (!archivePath || archivePath === "-" || status === "failed") {
            throw new Error(
                `Backup agent response is incomplete or failed: status=${status || "unknown"} archivePath=${archivePath || "missing"}`
            );
        }

        return { archivePath, status, taskId };
    }

    /**
     * Finalizes a backup run by writing the archive and updating run metadata.
     *
     * @param orchestrator Backup orchestrator used to persist the archive
     * @param task Backup task dispatched to the agent
     * @param agentResponse Raw agent response body
     * @param options Optional agent URL used to stage archives before remote uploads
     * @returns Destination location and provider id
     */
    export async function completeRun(
        orchestrator: BackupOrchestrator,
        task: BackupTask,
        agentResponse: unknown,
        options: { agentUrl?: string } = {}
    ): Promise<{ location: string; provider: string }> {
        const parsed = parseAgentResponse(agentResponse);

        console.debug(
            "[backups] complete taskId=%s status=%s archivePath=%s",
            parsed.taskId,
            parsed.status,
            parsed.archivePath
        );

        let archivePath = parsed.archivePath;

        if (task.destination.provider === "s3") {
            if (!options.agentUrl) {
                throw new Error("URL do agente é obrigatória para concluir backup S3.");
            }

            archivePath = await BackupArchiveStagingService.stageFromAgent(options.agentUrl, parsed.archivePath);
        }

        const writeResult = await orchestrator.write(task, archivePath);
        const completedAt = new Date().toISOString();
        const existing = await BackupRunModel.findByPk(task.taskId);
        const existingPayload = existing?.payload ?? {};

        await BackupRunModel.update(
            {
                status: "succeeded",
                completedAt,
                payload: {
                    ...existingPayload,
                    ...task,
                    location: writeResult.location,
                    provider: writeResult.provider,
                    archivePath: parsed.archivePath
                }
            },
            { where: { id: task.taskId } }
        );

        console.debug(
            "[backups] completed taskId=%s provider=%s location=%s",
            task.taskId,
            writeResult.provider,
            writeResult.location
        );

        return {
            location: writeResult.location,
            provider: writeResult.provider
        };
    }
}
