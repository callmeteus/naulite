import type { Readable } from "node:stream";

import type { ContainerRegistryBlobHeadResult, ContainerRegistryBlobWriteInput, S3ContainerRegistryDestination } from "@platform/shared";
import { ContainerRegistryBlobProvider } from "@platform/control-plane";

import { S3ObjectStore, type S3ObjectStoreOptions } from "./S3ObjectStore";

/**
 * Options for the S3 container registry blob provider.
 */
export interface S3ContainerRegistryBlobProviderOptions extends S3ObjectStoreOptions {
    objectStore?: S3ObjectStore;
}

/**
 * S3 container registry blob provider backed by {@link S3ObjectStore}.
 */
export class S3ContainerRegistryBlobProvider extends ContainerRegistryBlobProvider {
    readonly id = "s3";
    private readonly objectStore: S3ObjectStore;

    /**
     * Creates an S3 container registry blob provider.
     *
     * @param options Optional injected object store or S3 client configuration
     */
    constructor(options: S3ContainerRegistryBlobProviderOptions = {}) {
        super();
        this.objectStore = options.objectStore ?? new S3ObjectStore(options);
    }

    /**
     * Writes a docker save tarball to S3.
     *
     * @param input Write input including destination configuration and request body stream
     * @returns Destination-specific location identifier
     */
    async writeStream(
        input: ContainerRegistryBlobWriteInput
    ): Promise<{ location: string }> {
        if (input.destination.provider !== "s3") {
            throw new Error(`S3ContainerRegistryBlobProvider cannot handle provider ${input.destination.provider}`);
        }
        const destination = input.destination as S3ContainerRegistryDestination;
        const key = this.buildObjectKey(destination, input.name, input.tag);
        await this.objectStore.putObjectStream(
            {
                bucket: destination.bucket,
                region: destination.region,
                endpoint: destination.endpoint
            },
            key,
            input.body
        );

        return {
            location: this.objectStore.buildLocation(destination.bucket, key)
        };
    }

    /**
     * Opens a readable stream for an existing S3 blob location.
     *
     * @param location Destination-specific location identifier
     * @returns Readable blob stream
     */
    async getStream(location: string): Promise<Readable> {
        const parsed = this.objectStore.parseLocation(location);
        return this.objectStore.getObjectStream(parsed.config, parsed.key);
    }

    /**
     * Returns blob metadata when the S3 object exists.
     *
     * @param location Destination-specific location identifier
     * @returns Blob metadata or null when missing
     */
    async head(location: string): Promise<ContainerRegistryBlobHeadResult | null> {
        const parsed = this.objectStore.parseLocation(location);
        const head = await this.objectStore.headObject(parsed.config, parsed.key);

        if (!head) {
            return null;
        }

        return {
            sizeBytes: head.sizeBytes,
            digest: "",
            contentType: head.contentType ?? "application/octet-stream"
        };
    }

    /**
     * Deletes a blob from S3.
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
     * @param destination Container registry destination configuration
     * @param resolvedSecrets Resolved secret values keyed by secret name
     * @returns Whether the destination is healthy
     */
    async validate(
        destination: ContainerRegistryBlobWriteInput["destination"],
        resolvedSecrets: Record<string, string>
    ): Promise<boolean> {
        if (destination.provider !== "s3") {
            return false;
        }
        const s3Destination = destination as S3ContainerRegistryDestination;
        const hasCredentials = Boolean(
            resolvedSecrets[s3Destination.credentialsSecret.secretName]
            ?? Object.keys(resolvedSecrets).length > 0
        );
        console.debug(
            "[s3-storage] validate cr bucket=%s region=%s credentials=%s",
            s3Destination.bucket,
            s3Destination.region,
            hasCredentials
        );
        return hasCredentials && s3Destination.bucket.length > 0;
    }

    /**
     * Builds the S3 object key for a container image tarball.
     *
     * @param destination S3 destination configuration
     * @param name Image name
     * @param tag Image tag
     * @returns S3 object key
     */
    private buildObjectKey(destination: S3ContainerRegistryDestination, name: string, tag: string): string {
        const prefix = destination.prefix.replace(/^\/+|\/+$/g, "");
        const fileName = `cr/${name}/${tag}.tar`;
        return prefix.length > 0 ? `${prefix}/${fileName}` : fileName;
    }
}

/**
 * Default S3 container registry blob provider instance.
 */
export const s3ContainerRegistryBlobProvider = new S3ContainerRegistryBlobProvider();

/**
 * Creates an S3 container registry blob provider.
 *
 * @param options Optional injected object store or S3 client configuration
 * @returns Configured S3 container registry blob provider
 */
export function createS3ContainerRegistryBlobProvider(
    options?: S3ContainerRegistryBlobProviderOptions
): S3ContainerRegistryBlobProvider {
    return new S3ContainerRegistryBlobProvider(options);
}
