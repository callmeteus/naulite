import { copyFile, mkdir, stat, unlink } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";

import type { BackupDestinationReadResult, BackupDestinationResult, BackupTask, LocalBackupDestination } from "@platform/shared";

import { BackupDestinationProvider } from "./BackupDestinationProvider";

/**
 * Local filesystem backup destination provider.
 */
export class LocalBackupDestinationProvider extends BackupDestinationProvider {
    readonly id = "local";

    /**
     * Writes a backup archive to a local destination path.
     * 
     * @param task Backup task resolved by the control plane
     * @param archivePath Local archive path on the agent
     * @returns Destination result metadata
     */
    async write(task: BackupTask, archivePath: string): Promise<BackupDestinationResult> {
        if (task.destination.provider !== "local") {
            throw new Error(`LocalBackupDestinationProvider cannot handle provider ${task.destination.provider}`);
        }
        const destination = task.destination as LocalBackupDestination;

        const destinationDir = destination.path;
        await mkdir(destinationDir, { recursive: true });
        const fileName = `${task.volumeName}-${task.taskId}.tar.gz`;
        const destinationPath = path.join(destinationDir, fileName);
        console.debug("[backups] local write taskId=%s destination=%s", task.taskId, destinationPath);
        await copyFile(archivePath, destinationPath);
        const fileStat = await stat(destinationPath);

        return {
            location: destinationPath,
            sizeBytes: fileStat.size
        };
    }

    /**
     * Opens a readable stream for a local backup archive.
     *
     * @param task Backup task containing destination configuration
     * @param location Destination-specific location identifier
     * @returns Readable backup archive stream
     */
    async read(task: BackupTask, location: string): Promise<BackupDestinationReadResult> {
        if (task.destination.provider !== "local") {
            throw new Error(`LocalBackupDestinationProvider cannot handle provider ${task.destination.provider}`);
        }

        console.debug("[backups] local read location=%s", location);
        const fileStat = await stat(location);

        return {
            stream: createReadStream(location),
            sizeBytes: fileStat.size
        };
    }

    /**
     * Deletes a local backup archive.
     * 
     * @param location Destination-specific location identifier
     * @returns Nothing.
     */
    async delete(location: string): Promise<void> {
        console.debug("[backups] local delete location=%s", location);
        await unlink(location);
    }

    /**
     * Validates that the local destination directory is writable.
     * 
     * @param task Backup task containing destination configuration
     * @returns Whether the destination is healthy
     */
    async validate(task: BackupTask): Promise<boolean> {
        if (task.destination.provider !== "local") {
            return false;
        }
        const destination = task.destination as LocalBackupDestination;

        try {
            await mkdir(destination.path, { recursive: true });
            console.debug("[backups] local validate path=%s healthy=true", destination.path);
            return true;
        } catch (err) {
            console.debug("[backups] local validate path=%s healthy=false err=%o", destination.path, err);
            return false;
        }
    }
}
