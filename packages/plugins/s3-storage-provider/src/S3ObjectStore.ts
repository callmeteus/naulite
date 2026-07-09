import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { Readable } from "node:stream";

import {
    DeleteObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    PutObjectCommand,
    S3Client,
    type S3ClientConfig
} from "@aws-sdk/client-s3";

/**
 * S3 connection settings shared by backup and container registry adapters.
 */
export interface S3ObjectStoreConfig {
    bucket: string;
    region: string;
    endpoint?: string;
}

/**
 * Options for {@link S3ObjectStore}.
 */
export interface S3ObjectStoreOptions {
    client?: S3Client;
    defaultClientConfig?: S3ClientConfig;
}

/**
 * Metadata returned by {@link S3ObjectStore.headObject}.
 */
export interface S3ObjectHeadResult {
    sizeBytes: number;
    contentType?: string;
}

/**
 * Shared S3 object store used by backup and container registry blob providers.
 */
export class S3ObjectStore {
    private readonly defaultClientConfig?: S3ClientConfig;
    private readonly injectedClient?: S3Client;

    /**
     * Creates an S3 object store wrapper.
     *
     * @param options Optional injected client or default client configuration
     */
    constructor(options: S3ObjectStoreOptions = {}) {
        this.injectedClient = options.client;
        this.defaultClientConfig = options.defaultClientConfig;
    }

    /**
     * Uploads an object from a readable stream.
     *
     * @param config S3 connection settings
     * @param key Object key
     * @param body Readable payload stream
     * @returns Uploaded object size in bytes
     */
    async putObjectStream(config: S3ObjectStoreConfig, key: string, body: Readable): Promise<number> {
        const client = this.resolveClient(config);
        console.debug("[s3-storage] put bucket=%s key=%s", config.bucket, key);

        await client.send(new PutObjectCommand({
            Bucket: config.bucket,
            Key: key,
            Body: body
        }));

        const head = await this.headObject(config, key);
        return head?.sizeBytes ?? 0;
    }

    /**
     * Uploads an object from a local filesystem path.
     *
     * @param config S3 connection settings
     * @param key Object key
     * @param filePath Local file path
     * @returns Uploaded object size in bytes
     */
    async putObjectFile(config: S3ObjectStoreConfig, key: string, filePath: string): Promise<number> {
        const fileStat = await stat(filePath);
        const client = this.resolveClient(config);
        console.debug("[s3-storage] put file bucket=%s key=%s sizeBytes=%d", config.bucket, key, fileStat.size);

        await client.send(new PutObjectCommand({
            Bucket: config.bucket,
            Key: key,
            Body: createReadStream(filePath)
        }));

        return fileStat.size;
    }

    /**
     * Opens a readable stream for an object.
     *
     * @param config S3 connection settings
     * @param key Object key
     * @returns Readable object stream
     * @throws {Error} {@link Error}
     */
    async getObjectStream(config: S3ObjectStoreConfig, key: string): Promise<Readable> {
        const client = this.resolveClient(config);
        console.debug("[s3-storage] get bucket=%s key=%s", config.bucket, key);
        const response = await client.send(new GetObjectCommand({
            Bucket: config.bucket,
            Key: key
        }));

        if (!response.Body || typeof response.Body === "string") {
            throw new Error(`S3 object body missing for s3://${config.bucket}/${key}`);
        }

        return response.Body as Readable;
    }

    /**
     * Returns object metadata when the key exists.
     *
     * @param config S3 connection settings
     * @param key Object key
     * @returns Object metadata or null when missing
     * @throws {unknown}
     */
    async headObject(config: S3ObjectStoreConfig, key: string): Promise<S3ObjectHeadResult | null> {
        const client = this.resolveClient(config);
        console.debug("[s3-storage] head bucket=%s key=%s", config.bucket, key);

        try {
            const response = await client.send(new HeadObjectCommand({
                Bucket: config.bucket,
                Key: key
            }));

            return {
                sizeBytes: response.ContentLength ?? 0,
                contentType: response.ContentType
            };
        } catch (err) {
            if (S3ObjectStore.isNotFoundError(err)) {
                console.debug("[s3-storage] head missing bucket=%s key=%s", config.bucket, key);
                return null;
            }

            throw err;
        }
    }

    /**
     * Deletes an object from the bucket.
     *
     * @param config S3 connection settings
     * @param key Object key
     * @returns Nothing.
     */
    async deleteObject(config: S3ObjectStoreConfig, key: string): Promise<void> {
        const client = this.resolveClient(config);
        console.debug("[s3-storage] delete bucket=%s key=%s", config.bucket, key);
        await client.send(new DeleteObjectCommand({
            Bucket: config.bucket,
            Key: key
        }));
    }

    /**
     * Parses an s3:// location into bucket/key parts.
     *
     * @param location S3 location URI
     * @param metadata Optional region and endpoint overrides from backup metadata
     * @returns Parsed bucket and key
     * @throws {Error} {@link Error}
     */
    parseLocation(
        location: string,
        metadata?: Pick<S3ObjectStoreConfig, "region" | "endpoint">
    ): { bucket: string; key: string; config: S3ObjectStoreConfig } {
        const match = /^s3:\/\/([^/]+)\/(.+)$/.exec(location);

        if (!match) {
            throw new Error(`Invalid S3 location: ${location}`);
        }

        const region = metadata?.region
            ?? process.env.AWS_REGION
            ?? process.env.AWS_DEFAULT_REGION
            ?? "us-east-1";

        const endpoint = metadata?.endpoint ?? process.env.S3_ENDPOINT;

        console.debug(
            "[s3-storage] parse location=%s region=%s endpoint=%s",
            location,
            region,
            endpoint ?? "-"
        );

        return {
            bucket: match[1],
            key: match[2],
            config: {
                bucket: match[1],
                region,
                endpoint
            }
        };
    }

    /**
     * Builds an s3:// location URI.
     *
     * @param bucket S3 bucket name
     * @param key Object key
     * @returns S3 location URI
     */
    buildLocation(bucket: string, key: string): string {
        return `s3://${bucket}/${key}`;
    }

    /**
     * Resolves an S3 client for the current configuration.
     *
     * @param config S3 connection settings
     * @returns Configured S3 client
     */
    private resolveClient(config: S3ObjectStoreConfig): S3Client {
        if (this.injectedClient) {
            return this.injectedClient;
        }

        return new S3Client({
            region: config.region,
            endpoint: config.endpoint,
            forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
            ...this.defaultClientConfig
        });
    }

    /**
     * Returns whether an error represents a missing S3 object.
     *
     * @param err Candidate error
     * @returns Whether the object was not found
     */
    private static isNotFoundError(err: unknown): boolean {
        return typeof err === "object"
            && err !== null
            && "name" in err
            && (err as { name?: string }).name === "NotFound";
    }
}
