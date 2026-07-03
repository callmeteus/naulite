import type { Readable } from "node:stream";

import type { ContainerRegistryDestination } from "../types/ContainerRegistry";

/**
 * Metadata returned by a container registry blob head request.
 */
export interface ContainerRegistryBlobHeadResult {
    sizeBytes: number;
    digest: string;
    contentType: string;
}

/**
 * Result of writing a container image blob to a destination.
 */
export interface ContainerRegistryBlobWriteResult {
    location: string;
}

/**
 * Input for writing a container image blob through a destination provider.
 */
export interface ContainerRegistryBlobWriteInput {
    name: string;
    tag: string;
    destination: ContainerRegistryDestination;
    body: Readable;
    resolvedSecrets: Record<string, string>;
}

/**
 * Container registry blob provider contract for local, S3, and plugin destinations.
 */
export interface ContainerRegistryBlobProvider {
    /**
     * Provider identifier registered without the plugin- directory prefix.
     */
    readonly id: string;

    /**
     * Writes a docker save tarball for the given image reference.
     *
     * @param input Write input including destination configuration and request body stream
     * @returns Destination-specific location identifier
     */
    writeStream(input: ContainerRegistryBlobWriteInput): Promise<ContainerRegistryBlobWriteResult>;

    /**
     * Opens a readable stream for an existing blob location.
     *
     * @param location Destination-specific location identifier
     * @returns Readable blob stream
     */
    getStream(location: string): Promise<Readable>;

    /**
     * Returns blob metadata when the location exists.
     *
     * @param location Destination-specific location identifier
     * @returns Blob metadata or null when missing
     */
    head(location: string): Promise<ContainerRegistryBlobHeadResult | null>;

    /**
     * Deletes a blob from the destination store.
     *
     * @param location Destination-specific location identifier
     * @returns Nothing.
     */
    delete(location: string): Promise<void>;

    /**
     * Validates that the destination configuration is reachable.
     *
     * @param destination Container registry destination configuration
     * @param resolvedSecrets Resolved secret values keyed by secret name
     * @returns Whether the destination is healthy
     */
    validate(
        destination: ContainerRegistryDestination,
        resolvedSecrets: Record<string, string>
    ): Promise<boolean>;
}
