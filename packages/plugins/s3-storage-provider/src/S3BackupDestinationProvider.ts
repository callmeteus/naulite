import type { BackupDestinationReadResult, BackupDestinationResult, BackupTask, S3BackupDestination } from "@platform/shared";
import { BackupDestinationProvider } from "@platform/control-plane";

import { S3ObjectStore, type S3ObjectStoreOptions } from "./S3ObjectStore";

/**
 * Options for the S3 backup destination provider.
 */
export interface S3BackupDestinationProviderOptions extends S3ObjectStoreOptions {
    objectStore?: S3ObjectStore;
}

/**
 * S3 backup destination provider backed by {@link S3ObjectStore}.
 */
export class S3BackupDestinationProvider extends BackupDestinationProvider {
    readonly id = "s3";
    private readonly objectStore: S3ObjectStore;

    /**
     * Creates an S3 backup destination provider.
     *
     * @param options Optional injected object store or S3 client configuration
     */
    constructor(options: S3BackupDestinationProviderOptions = {}) {
        super();
        this.objectStore = options.objectStore ?? new S3ObjectStore(options);
    }

    /**
     * Uploads a backup archive to an S3-compatible object store.
     *
     * @param task Backup task resolved by the control plane
     * @param archivePath Local archive path on the agent
     * @returns Destination result metadata
     */
    async write(task: BackupTask, archivePath: string): Promise<BackupDestinationResult> {
        if (task.destination.provider !== "s3") {
            throw new Error(`S3BackupDestinationProvider cannot handle provider ${task.destination.provider}`);
        }
        const destination = task.destination as S3BackupDestination;
        const key = this.buildObjectKey(task, destination);
        const sizeBytes = await this.objectStore.putObjectFile(
            {
                bucket: destination.bucket,
                region: destination.region,
                endpoint: destination.endpoint
            },
            key,
            archivePath
        );

        return {
            location: this.objectStore.buildLocation(destination.bucket, key),
            sizeBytes
        };
    }

    /**
     * Opens a readable stream for a backup archive stored in S3.
     *
     * @param task Backup task containing destination configuration
     * @param location Destination-specific location identifier
     * @returns Readable backup archive stream
     */
    async read(task: BackupTask, location: string): Promise<BackupDestinationReadResult> {
        if (task.destination.provider !== "s3") {
            throw new Error(`S3BackupDestinationProvider cannot handle provider ${task.destination.provider}`);
        }
        const destination = task.destination as S3BackupDestination;
        const parsed = this.objectStore.parseLocation(location, {
            region: destination.region,
            endpoint: destination.endpoint
        });
        const stream = await this.objectStore.getObjectStream(parsed.config, parsed.key);
        const head = await this.objectStore.headObject(parsed.config, parsed.key);

        return {
            stream,
            sizeBytes: head?.sizeBytes
        };
    }

    /**
     * Deletes a backup object from S3.
     *
     * @param location Destination-specific location identifier
     * @returns Nothing.
     */
    async delete(location: string): Promise<void> {
        const parsed = this.objectStore.parseLocation(location);
        await this.objectStore.deleteObject(parsed.config, parsed.key);
    }

    /**
     * Validates that the configured S3 destination can be reached.
     *
     * @param task Backup task containing destination configuration
     * @returns Whether the destination is healthy
     */
    async validate(task: BackupTask): Promise<boolean> {
        if (task.destination.provider !== "s3") {
            return false;
        }
        const destination = task.destination as S3BackupDestination;

        const hasCredentials = Boolean(
            task.resolvedSecrets[destination.credentialsSecret.secretName]
            ?? Object.keys(task.resolvedSecrets).length > 0
        );
        console.debug(
            "[s3-storage] validate backup bucket=%s region=%s credentials=%s",
            destination.bucket,
            destination.region,
            hasCredentials
        );
        return hasCredentials && destination.bucket.length > 0;
    }

    /**
     * Builds the destination object key for a backup task.
     *
     * @param task Backup task resolved by the control plane
     * @param destination S3 destination configuration
     * @returns S3 object key
     */
    private buildObjectKey(task: BackupTask, destination: S3BackupDestination): string {
        const prefix = destination.prefix.replace(/^\/+|\/+$/g, "");
        const fileName = `${task.volumeName}-${task.taskId}.tar.gz`;
        return prefix.length > 0 ? `${prefix}/${fileName}` : fileName;
    }
}

/**
 * Default S3 backup destination provider instance.
 */
export const s3BackupDestinationProvider = new S3BackupDestinationProvider();

/**
 * Creates an S3 backup destination provider.
 *
 * @param options Optional injected object store or S3 client configuration
 * @returns Configured S3 backup destination provider
 */
export function createS3BackupDestinationProvider(
    options?: S3BackupDestinationProviderOptions
): S3BackupDestinationProvider {
    return new S3BackupDestinationProvider(options);
}
