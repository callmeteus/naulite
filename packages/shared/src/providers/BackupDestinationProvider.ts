import type { BackupTask } from "../types/BackupTask.js";

/**
 * Result metadata for a completed backup upload or write.
 */
export interface BackupDestinationResult {
    location: string;
    sizeBytes: number;
    checksum?: string;
}

/**
 * Backup destination provider contract for local, node, and plugin destinations.
 */
export interface BackupDestinationProvider {
    /**
     * Provider identifier registered without the plugin- directory prefix.
     */
    readonly id: string;

    /**
     * Writes or uploads a backup archive for a dispatched task.
     * 
     * @param task Backup task resolved by the control plane
     * @param archivePath Local archive path on the agent
     * @returns Destination result metadata
     */
    write(task: BackupTask, archivePath: string): Promise<BackupDestinationResult>;

    /**
     * Deletes a backup object according to retention policy.
     * 
     * @param location Destination-specific location identifier
     * @returns Nothing.
     */
    delete(location: string): Promise<void>;

    /**
     * Validates that the destination configuration is reachable.
     * 
     * @param task Backup task containing destination configuration
     * @returns Whether the destination is healthy
     */
    validate(task: BackupTask): Promise<boolean>;
}
