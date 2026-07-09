import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { Logger } from "../Logger";
import { AgentProxyService } from "./AgentProxyService";
const logBackups = Logger.create("backups");

/**
 * Stages backup archives from agents onto the control plane filesystem.
 */
export namespace BackupArchiveStagingService {
    /**
     * Downloads a backup archive from an agent into a control plane temp file.
     *
     * @param agentUrl Node agent base URL
     * @param archivePath Absolute archive path on the agent
     * @returns Local temp file path on the control plane
     */
    export async function stageFromAgent(agentUrl: string, archivePath: string): Promise<string> {
        logBackups.debug("stage from agent archivePath=%s", archivePath);
        const archiveBytes = await AgentProxyService.fetchBackupArchive(agentUrl, archivePath);
        const tempDir = await mkdtemp(path.join(os.tmpdir(), "naulite-backup-stage-"));
        const fileName = path.basename(archivePath);
        const stagedPath = path.join(tempDir, fileName.length > 0 ? fileName : "archive.tar.gz");

        await writeFile(stagedPath, archiveBytes);
        logBackups.debug("staged archive bytes=%d path=%s", archiveBytes.length, stagedPath);

        return stagedPath;
    }
}
