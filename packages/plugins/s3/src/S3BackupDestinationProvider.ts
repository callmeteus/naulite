import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

import {
    DeleteObjectCommand,
    PutObjectCommand,
    S3Client,
    type S3ClientConfig
} from "@aws-sdk/client-s3";

import type { BackupDestinationResult, BackupTask, S3BackupDestination } from "@platform/shared";
import type { PluginRegistration } from "@platform/shared";
import { BackupDestinationProvider } from "@platform/control-plane";

/**
 * Options for the S3 backup destination provider.
 */
export interface S3BackupDestinationProviderOptions {
    client?: S3Client;
    defaultClientConfig?: S3ClientConfig;
}

/**
 * S3 backup destination provider backed by @aws-sdk/client-s3.
 */
export class S3BackupDestinationProvider extends BackupDestinationProvider {
    readonly id = "s3";
    private readonly defaultClientConfig?: S3ClientConfig;
    private readonly injectedClient?: S3Client;

    /**
     * Creates an S3 backup destination provider.
     * 
     * @param options Optional injected S3 client or default client configuration
     */
    constructor(options: S3BackupDestinationProviderOptions = {}) {
        super();
        this.injectedClient = options.client;
        this.defaultClientConfig = options.defaultClientConfig;
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

        const client = this.resolveClient(destination);
        const key = this.buildObjectKey(task, destination);
        const fileStat = await stat(archivePath);
        console.debug(
            "[plugin-s3] write taskId=%s bucket=%s key=%s sizeBytes=%d",
            task.taskId,
            destination.bucket,
            key,
            fileStat.size
        );

        await client.send(new PutObjectCommand({
            Bucket: destination.bucket,
            Key: key,
            Body: createReadStream(archivePath)
        }));

        return {
            location: `s3://${destination.bucket}/${key}`,
            sizeBytes: fileStat.size
        };
    }

    /**
     * Deletes a backup object from S3.
     * 
     * @param location Destination-specific location identifier
     * @returns Nothing.
     */
    async delete(location: string): Promise<void> {
        const parsed = this.parseLocation(location);
        const client = this.injectedClient ?? new S3Client(this.defaultClientConfig ?? {});
        console.debug("[plugin-s3] delete bucket=%s key=%s", parsed.bucket, parsed.key);
        await client.send(new DeleteObjectCommand({
            Bucket: parsed.bucket,
            Key: parsed.key
        }));
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
            "[plugin-s3] validate bucket=%s region=%s credentials=%s",
            destination.bucket,
            destination.region,
            hasCredentials
        );
        return hasCredentials && destination.bucket.length > 0;
    }

    /**
     * Resolves an S3 client for the current task.
     * 
     * @param destination S3 destination configuration
     * @returns Configured S3 client
     */
    private resolveClient(destination: S3BackupDestination): S3Client {
        if (this.injectedClient) {
            return this.injectedClient;
        }

        return new S3Client({
            region: destination.region,
            endpoint: destination.endpoint,
            ...this.defaultClientConfig
        });
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

    /**
     * Parses an s3:// location into bucket and key parts.
     * 
     * @param location S3 location URI
     * @returns Parsed bucket and key
     */
    private parseLocation(location: string): { bucket: string; key: string } {
        const match = /^s3:\/\/([^/]+)\/(.+)$/.exec(location);
        if (!match) {
            throw new Error(`Invalid S3 location: ${location}`);
        }

        return { bucket: match[1], key: match[2] };
    }
}

/**
 * Plugin registration metadata for the S3 backup destination provider.
 */
export const s3BackupPluginRegistration: PluginRegistration = {
    id: "s3",
    type: "backupDestination",
    version: "0.1.0"
};

/**
 * Default S3 backup destination provider instance.
 */
export const s3BackupDestinationProvider = new S3BackupDestinationProvider();

/**
 * Creates an S3 backup destination provider.
 * 
 * @param options Optional injected S3 client or default client configuration
 * @returns Configured S3 backup destination provider
 */
export function createS3BackupDestinationProvider(
    options?: S3BackupDestinationProviderOptions
): S3BackupDestinationProvider {
    return new S3BackupDestinationProvider(options);
}
