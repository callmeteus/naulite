import type { Readable } from "node:stream";

import type { BackupTask, Node, Volume } from "@naulite/shared";

import { Logger } from "../Logger";
import type { BackupOrchestrator } from "../modules/backup/BackupOrchestrator";
import { AgentProxyService } from "./AgentProxyService";
import { BackupDispatchService } from "./BackupDispatchService";
const logBackups = Logger.create("backups");

/**
 * Backup run details required to coordinate a restore.
 */
export interface BackupRunRestoreInput {
    id: string;
    volumeName: string;
    status: string;
    payload: Record<string, unknown>;
}

/**
 * Options for {@link BackupRestoreService.restore}.
 */
export interface BackupRestoreOptions {
    backupId: string;
    run: BackupRunRestoreInput;
    node: Node;
    volume?: Volume;
    orchestrator: BackupOrchestrator;
}

/**
 * Coordinates backup restore flows across destination providers.
 */
export namespace BackupRestoreService {
    /**
     * Restores a backup run on the target volume node.
     *
     * @param options Restore coordination options
     * @returns Agent restore response payload
     * @throws {Error} {@link Error}
     */
    export async function restore(options: BackupRestoreOptions): Promise<unknown> {
        const { backupId, run, node, volume, orchestrator } = options;
        const payload = run.payload;
        const provider = resolveProvider(payload);
        const location = typeof payload.location === "string" ? payload.location : undefined;
        const archivePath = typeof payload.archivePath === "string" ? payload.archivePath : undefined;

        logBackups.debug("restore backupId=%s provider=%s location=%s archivePath=%s",
            backupId,
            provider,
            location ?? "-",
            archivePath ?? "-"
        );

        if (provider === "s3") {
            if (!location) {
                throw new Error(`Backup ${backupId} não possui localização S3 registrada.`);
            }

            const task = extractBackupTask(payload, backupId, run.volumeName);
            const readResult = await orchestrator.read(task, location);
            const archiveBytes = await readStreamToBuffer(readResult.stream);
            const receiveResponse = await AgentProxyService.postBinary(
                node.agentUrl!,
                `/backups/receive?backupId=${encodeURIComponent(backupId)}`,
                archiveBytes,
                "application/gzip"
            );

            const storedPath = parseStoredPath(receiveResponse);

            return BackupDispatchService.dispatchRestoreTask(node, {
                backupId,
                volumeName: run.volumeName,
                archivePath: storedPath,
                mountPath: volume?.mountPath
            });
        }

        const resolvedArchivePath = archivePath ?? location;

        return BackupDispatchService.dispatchRestoreTask(node, {
            backupId,
            volumeName: run.volumeName,
            archivePath: resolvedArchivePath,
            mountPath: volume?.mountPath
        });
    }

    /**
     * Resolves the destination provider id from a backup run payload.
     *
     * @param payload Backup run payload
     * @returns Destination provider id
     */
    export function resolveProvider(payload: Record<string, unknown>): string {
        if (typeof payload.provider === "string" && payload.provider.length > 0) {
            return payload.provider;
        }

        const destination = payload.destination;

        if (typeof destination === "object" && destination !== null) {
            const provider = (destination as { provider?: unknown }).provider;

            if (typeof provider === "string" && provider.length > 0) {
                return provider;
            }
        }

        return "local";
    }

    /**
     * Reconstructs a backup task from a persisted backup run payload.
     *
     * @param payload Backup run payload
     * @param backupId Backup run identifier
     * @param volumeName Volume name fallback
     * @returns Backup task used for destination provider reads
     * @throws {Error} {@link Error}
     */
    export function extractBackupTask(
        payload: Record<string, unknown>,
        backupId: string,
        volumeName: string
    ): BackupTask {
        const destination = payload.destination;

        if (typeof destination !== "object" || destination === null) {
            throw new Error(`Backup ${backupId} não possui configuração de destino.`);
        }

        return {
            taskId: typeof payload.taskId === "string" ? payload.taskId : backupId,
            volumeId: typeof payload.volumeId === "string" ? payload.volumeId : volumeName,
            volumeName: typeof payload.volumeName === "string" ? payload.volumeName : volumeName,
            nodeId: typeof payload.nodeId === "string" ? payload.nodeId : "unscheduled",
            includes: Array.isArray(payload.includes) ? payload.includes as BackupTask["includes"] : [],
            excludes: Array.isArray(payload.excludes) ? payload.excludes as BackupTask["excludes"] : [],
            retention: payload.retention as BackupTask["retention"],
            destination: destination as BackupTask["destination"],
            resolvedSecrets: typeof payload.resolvedSecrets === "object" && payload.resolvedSecrets !== null
                ? payload.resolvedSecrets as Record<string, string>
                : {},

            status: "completed"
        };
    }

    /**
     * Parses the stored archive path returned by `/backups/receive`.
     *
     * @param response Agent response payload
     * @returns Stored archive path on the agent
     * @throws {Error} {@link Error}
     */
    export function parseStoredPath(response: unknown): string {
        if (typeof response !== "object" || response === null) {
            throw new Error("Resposta inválida do agente ao receber backup.");
        }

        const storedPath = (response as { storedPath?: unknown }).storedPath;

        if (typeof storedPath !== "string" || storedPath.length === 0) {
            throw new Error("Agente não retornou storedPath após receber backup.");
        }

        return storedPath;
    }

    /**
     * Reads a readable stream into a single buffer.
     *
     * @param stream Readable backup archive stream
     * @returns Buffered archive bytes
     */
    export async function readStreamToBuffer(stream: Readable): Promise<Buffer> {
        const chunks: Buffer[] = [];

        for await (const chunk of stream) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }

        return Buffer.concat(chunks);
    }
}
