import { createHash } from "node:crypto";
import type { Readable } from "node:stream";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import type {
    ContainerRegistryDestination,
    ContainerRegistryImage
} from "@platform/shared";

import { ContainerRegistryImageModel } from "../../database/models/ContainerRegistryImageModel";
import { ContainerRegistryBlobProvider } from "./ContainerRegistryBlobProvider";
import { LocalContainerRegistryBlobProvider } from "./LocalContainerRegistryBlobProvider";

/**
 * Options for {@link ContainerRegistryService}.
 */
export interface ContainerRegistryServiceOptions {
    defaultDestination?: ContainerRegistryDestination;
    resolvedSecrets?: Record<string, string>;
}

/**
 * Orchestrates container registry blob providers and image metadata persistence.
 */
export class ContainerRegistryService {
    private readonly providers = new Map<string, ContainerRegistryBlobProvider>();
    private readonly defaultDestination: ContainerRegistryDestination;
    private readonly resolvedSecrets: Record<string, string>;

    /**
     * Creates a container registry service with the built-in local provider.
     *
     * @param options Optional default destination and resolved secrets
     */
    constructor(options: ContainerRegistryServiceOptions = {}) {
        this.defaultDestination = options.defaultDestination ?? ContainerRegistryService.resolveDefaultDestination();
        this.resolvedSecrets = options.resolvedSecrets ?? {};
        this.providers.set("local", new LocalContainerRegistryBlobProvider());
    }

    /**
     * Registers an additional container registry blob provider.
     *
     * @param provider Container registry blob provider to register
     * @returns Nothing.
     */
    register(provider: ContainerRegistryBlobProvider): void {
        console.debug("[container-registry] register provider=%s", provider.id);
        this.providers.set(provider.id, provider);
    }

    /**
     * Lists stored container images ordered by push time descending.
     *
     * @returns Container image metadata entries
     */
    async listImages(): Promise<ContainerRegistryImage[]> {
        const rows = await ContainerRegistryImageModel.findAll({
            order: [["pushedAt", "DESC"]]
        });

        return rows.map((row) => ContainerRegistryService.mapModel(row));
    }

    /**
     * Returns image metadata when present.
     *
     * @param name Image name
     * @param tag Image tag
     * @returns Image metadata or null when missing
     */
    async getImage(name: string, tag: string): Promise<ContainerRegistryImage | null> {
        const row = await ContainerRegistryImageModel.findOne({
            where: { name, tag }
        });

        return row ? ContainerRegistryService.mapModel(row) : null;
    }

    /**
     * Returns blob metadata for an image when present.
     *
     * @param name Image name
     * @param tag Image tag
     * @returns Blob metadata or null when missing
     */
    async headImage(name: string, tag: string): Promise<{
        image: ContainerRegistryImage;
        sizeBytes: number;
        digest: string;
        contentType: string;
    } | null> {
        const image = await this.getImage(name, tag);
        if (!image) {
            console.debug("[container-registry] head missing name=%s tag=%s", name, tag);
            return null;
        }

        return {
            image,
            sizeBytes: image.sizeBytes,
            digest: image.digest,
            contentType: "application/octet-stream"
        };
    }

    /**
     * Opens a readable stream for an existing image blob.
     *
     * @param name Image name
     * @param tag Image tag
     * @returns Image metadata and readable blob stream
     */
    async getImageStream(name: string, tag: string): Promise<{ image: ContainerRegistryImage; stream: Readable }> {
        const image = await this.getImage(name, tag);
        if (!image) {
            throw new Error(`Container image ${name}:${tag} not found.`);
        }

        const provider = this.resolveProvider(image.destination);
        if (!provider) {
            throw new Error(`No container registry provider registered for ${image.destination.provider}`);
        }

        console.debug("[container-registry] get stream name=%s tag=%s provider=%s", name, tag, provider.id);
        const stream = await provider.getStream(image.location);
        return { image, stream };
    }

    /**
     * Stores a docker save tarball and persists image metadata.
     *
     * @param name Image name
     * @param tag Image tag
     * @param body Incoming request body stream
     * @param destination Optional destination override
     * @returns Persisted image metadata
     */
    async putImage(
        name: string,
        tag: string,
        body: Readable,
        destination: ContainerRegistryDestination = this.defaultDestination
    ): Promise<ContainerRegistryImage> {
        const provider = this.resolveProvider(destination);
        if (!provider) {
            throw new Error(`No container registry provider registered for ${destination.provider}`);
        }

        const digestTracker = ContainerRegistryService.createDigestTrackingStream();
        console.debug("[container-registry] put name=%s tag=%s provider=%s", name, tag, provider.id);
        const writePromise = provider.writeStream({
            name,
            tag,
            destination,
            body: digestTracker.stream,
            resolvedSecrets: this.resolvedSecrets
        });
        await Promise.all([
            pipeline(body, digestTracker.stream),
            writePromise
        ]);
        const writeResult = await writePromise;
        const digest = digestTracker.getDigest();
        const sizeBytes = digestTracker.getSize();
        const pushedAt = new Date().toISOString();
        const image: ContainerRegistryImage = {
            name,
            tag,
            digest,
            sizeBytes,
            destination,
            location: writeResult.location,
            pushedAt
        };

        await ContainerRegistryImageModel.upsert({
            name,
            tag,
            digest,
            sizeBytes,
            destination,
            location: writeResult.location,
            pushedAt
        });

        return image;
    }

    /**
     * Deletes image metadata and the backing blob when present.
     *
     * @param name Image name
     * @param tag Image tag
     * @returns Whether an image was deleted
     */
    async deleteImage(name: string, tag: string): Promise<boolean> {
        const image = await this.getImage(name, tag);
        if (!image) {
            console.debug("[container-registry] delete missing name=%s tag=%s", name, tag);
            return false;
        }

        const provider = this.resolveProvider(image.destination);
        if (!provider) {
            throw new Error(`No container registry provider registered for ${image.destination.provider}`);
        }

        console.debug("[container-registry] delete name=%s tag=%s provider=%s", name, tag, provider.id);
        await provider.delete(image.location);
        await ContainerRegistryImageModel.destroy({
            where: { name, tag }
        });
        return true;
    }

    /**
     * Resolves the default local destination from environment variables.
     *
     * @returns Default container registry destination
     */
    static resolveDefaultDestination(): ContainerRegistryDestination {
        return {
            provider: "local",
            path: process.env.PLATFORM_CONTAINER_REGISTRY_PATH ?? "./data/container-registry"
        };
    }

    /**
     * Maps a Sequelize model row to a container image record.
     *
     * @param row Container registry image model row
     * @returns Container image metadata
     */
    private static mapModel(row: ContainerRegistryImageModel): ContainerRegistryImage {
        return {
            name: row.name,
            tag: row.tag,
            digest: row.digest,
            sizeBytes: row.sizeBytes,
            destination: row.destination as ContainerRegistryDestination,
            location: row.location,
            pushedAt: row.pushedAt
        };
    }

    /**
     * Resolves the blob provider for a destination configuration.
     *
     * @param destination Container registry destination configuration
     * @returns Matching blob provider when registered
     */
    private resolveProvider(destination: ContainerRegistryDestination): ContainerRegistryBlobProvider | undefined {
        return this.providers.get(destination.provider);
    }

    /**
     * Creates a transform stream that tracks SHA256 digest and byte size.
     *
     * @returns Digest tracker helpers
     */
    private static createDigestTrackingStream(): {
        stream: Transform;
        getDigest: () => string;
        getSize: () => number;
    } {
        const hash = createHash("sha256");
        let sizeBytes = 0;
        const stream = new Transform({
            transform(chunk, _encoding, callback) {
                hash.update(chunk);
                sizeBytes += chunk.length;
                callback(null, chunk);
            }
        });

        return {
            stream,
            getDigest: () => `sha256:${hash.digest("hex")}`,
            getSize: () => sizeBytes
        };
    }
}

/**
 * Creates a container registry service with the built-in local provider.
 *
 * @param options Optional default destination and resolved secrets
 * @returns Configured container registry service
 */
export function createContainerRegistryService(
    options?: ContainerRegistryServiceOptions
): ContainerRegistryService {
    return new ContainerRegistryService(options);
}
