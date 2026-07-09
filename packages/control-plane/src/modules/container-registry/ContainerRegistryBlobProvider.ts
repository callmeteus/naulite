import type { Readable } from "node:stream";
import type {
    ContainerRegistryBlobHeadResult,
    ContainerRegistryBlobWriteInput,
    ContainerRegistryBlobWriteResult,
    ContainerRegistryDestination
} from "@naulite/shared";

/**
 * Abstract container registry blob provider contract for local and plugin backends.
 */
export abstract class ContainerRegistryBlobProvider {
    /**
     * Provider identifier registered without the plugin- directory prefix.
     */
    abstract readonly id: string;

    /**
     * Writes a docker save tarball for the given image reference.
     *
     * @param input Write input including destination configuration and request body stream
     * @returns Destination-specific location identifier
     */
    abstract writeStream(input: ContainerRegistryBlobWriteInput): Promise<ContainerRegistryBlobWriteResult>;

    /**
     * Opens a readable stream for an existing blob location.
     *
     * @param location Destination-specific location identifier
     * @returns Readable blob stream
     */
    abstract getStream(location: string): Promise<Readable>;

    /**
     * Returns blob metadata when the location exists.
     *
     * @param location Destination-specific location identifier
     * @returns Blob metadata or null when missing
     */
    abstract head(location: string): Promise<ContainerRegistryBlobHeadResult | null>;

    /**
     * Deletes a blob from the destination store.
     *
     * @param location Destination-specific location identifier
     * @returns Nothing.
     */
    abstract delete(location: string): Promise<void>;

    /**
     * Validates that the destination configuration is reachable.
     *
     * @param destination Container registry destination configuration
     * @param resolvedSecrets Resolved secret values keyed by secret name
     * @returns Whether the destination is healthy
     */
    abstract validate(
        destination: ContainerRegistryDestination,
        resolvedSecrets: Record<string, string>
    ): Promise<boolean>;
}
