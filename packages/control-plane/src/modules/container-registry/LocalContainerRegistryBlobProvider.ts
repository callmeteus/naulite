import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";

import type { ContainerRegistryBlobHeadResult, ContainerRegistryBlobWriteInput, LocalContainerRegistryDestination } from "@platform/shared";

import { ContainerRegistryBlobProvider } from "./ContainerRegistryBlobProvider";

/**
 * Local filesystem container registry blob provider.
 */
export class LocalContainerRegistryBlobProvider extends ContainerRegistryBlobProvider {
    readonly id = "local";

    /**
     * Writes a docker save tarball to a local destination path.
     *
     * @param input Write input including destination configuration and request body stream
     * @returns Destination-specific location identifier
     */
    async writeStream(input: ContainerRegistryBlobWriteInput): Promise<{ location: string }> {
        if (input.destination.provider !== "local") {
            throw new Error(`LocalContainerRegistryBlobProvider cannot handle provider ${input.destination.provider}`);
        }
        const destination = input.destination as LocalContainerRegistryDestination;
        const destinationPath = this.resolveBlobPath(destination, input.name, input.tag);
        await mkdir(path.dirname(destinationPath), { recursive: true });
        console.debug("[container-registry] local write name=%s tag=%s path=%s", input.name, input.tag, destinationPath);
        await pipeline(input.body, createWriteStream(destinationPath));

        return { location: destinationPath };
    }

    /**
     * Opens a readable stream for a local blob path.
     *
     * @param location Destination-specific location identifier
     * @returns Readable blob stream
     */
    async getStream(location: string): Promise<Readable> {
        console.debug("[container-registry] local get location=%s", location);
        return createReadStream(location);
    }

    /**
     * Returns blob metadata when the local file exists.
     *
     * @param location Destination-specific location identifier
     * @returns Blob metadata or null when missing
     */
    async head(location: string): Promise<ContainerRegistryBlobHeadResult | null> {
        try {
            const fileStat = await stat(location);
            console.debug("[container-registry] local head location=%s sizeBytes=%d", location, fileStat.size);
            return {
                sizeBytes: fileStat.size,
                digest: "",
                contentType: "application/octet-stream"
            };
        } catch (err) {
            console.debug("[container-registry] local head missing location=%s err=%o", location, err);
            return null;
        }
    }

    /**
     * Deletes a local blob file.
     *
     * @param location Destination-specific location identifier
     * @returns Nothing.
     */
    async delete(location: string): Promise<void> {
        console.debug("[container-registry] local delete location=%s", location);
        await unlink(location);
    }

    /**
     * Validates that the local destination directory is writable.
     *
     * @param destination Container registry destination configuration
     * @returns Whether the destination is healthy
     */
    async validate(
        destination: Parameters<ContainerRegistryBlobProvider["validate"]>[0]
    ): Promise<boolean> {
        if (destination.provider !== "local") {
            return false;
        }
        const localDestination = destination as LocalContainerRegistryDestination;

        try {
            await mkdir(localDestination.path, { recursive: true });
            console.debug("[container-registry] local validate path=%s healthy=true", localDestination.path);
            return true;
        } catch (err) {
            console.debug("[container-registry] local validate path=%s healthy=false err=%o", localDestination.path, err);
            return false;
        }
    }

    /**
     * Resolves the filesystem path for an image tarball.
     *
     * @param destination Local destination configuration
     * @param name Image name
     * @param tag Image tag
     * @returns Absolute or relative blob path
     */
    private resolveBlobPath(destination: LocalContainerRegistryDestination, name: string, tag: string): string {
        return path.join(destination.path, name, `${tag}.tar`);
    }
}
