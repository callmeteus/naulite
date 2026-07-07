import type { Readable } from "node:stream";

import type { BackupTask } from "../types/BackupTask";

/**
 * Result metadata for a completed backup upload or write.
 */
export interface BackupDestinationResult {
    location: string;
    sizeBytes: number;
    checksum?: string;
}

/**
 * Readable backup archive returned by destination providers.
 */
export interface BackupDestinationReadResult {
    stream: Readable;
    sizeBytes?: number;
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
     * Opens a readable stream for a stored backup archive.
     *
     * @param task Backup task containing destination configuration
     * @param location Destination-specific location identifier
     * @returns Readable backup archive stream
     */
    read(task: BackupTask, location: string): Promise<BackupDestinationReadResult>;

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
