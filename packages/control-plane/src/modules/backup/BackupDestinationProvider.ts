import type { BackupDestinationResult, BackupTask } from "@platform/shared";

/**
 * Abstract backup destination provider contract for local and plugin backends.
 */
export abstract class BackupDestinationProvider {
    /**
     * Provider identifier registered without the plugin- directory prefix.
     */
    abstract readonly id: string;

    /**
     * Writes or uploads a backup archive for a dispatched task.
     *
     * @param task Backup task resolved by the control plane
     * @param archivePath Local archive path on the agent
     * @returns Destination result metadata
     */
    abstract write(task: BackupTask, archivePath: string): Promise<BackupDestinationResult>;

    /**
     * Deletes a backup object according to retention policy.
     *
     * @param location Destination-specific location identifier
     * @returns Nothing.
     */
    abstract delete(location: string): Promise<void>;

    /**
     * Validates that the destination configuration is reachable.
     *
     * @param task Backup task containing destination configuration
     * @returns Whether the destination is healthy
     */
    abstract validate(task: BackupTask): Promise<boolean>;
}
