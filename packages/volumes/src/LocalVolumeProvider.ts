import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

import type { ProvisionVolumeOptions, VolumeProvider } from "@platform/shared";
import type { Volume } from "@platform/shared";

/**
 * Options for the local cluster-scoped volume provider.
 */
export interface LocalVolumeProviderOptions {
    rootDir: string;
}

interface StoredVolume extends Volume {
    hostPath: string;
}

/**
 * Local filesystem volume provider with cluster-scoped metadata.
 */
export class LocalVolumeProvider implements VolumeProvider {
    private readonly rootDir: string;
    private readonly volumes = new Map<string, StoredVolume>();

    /**
     * Creates a local volume provider rooted at the given directory.
     * 
     * @param options Provider options including the storage root directory
     */
    constructor(options: LocalVolumeProviderOptions) {
        this.rootDir = options.rootDir;
    }

    /**
     * Lists volumes known to the control plane.
     * 
     * @returns Volume metadata entries
     */
    async list(): Promise<Volume[]> {
        console.debug("[volumes] list count=%d", this.volumes.size);
        return [...this.volumes.values()].map((volume) => this.toPublicVolume(volume));
    }

    /**
     * Provisions or binds a cluster-scoped volume on the selected node.
     * 
     * @param options Volume provisioning options
     * @returns Provisioned volume metadata
     */
    async provision(options: ProvisionVolumeOptions): Promise<Volume> {
        const now = new Date().toISOString();
        const volumeId = `vol_${options.volumeName}`;
        const hostPath = path.join(this.rootDir, options.volumeName);
        console.debug(
            "[volumes] provision volumeName=%s nodeId=%s hostPath=%s",
            options.volumeName,
            options.nodeId ?? "-",
            hostPath
        );

        await mkdir(hostPath, { recursive: true });

        const stored: StoredVolume = {
            id: volumeId,
            name: options.volumeName,
            manifestName: options.volumeName,
            scope: "cluster",
            nodeId: options.nodeId,
            mountPath: options.mountPath,
            sizeMb: options.sizeMb,
            status: "bound",
            createdAt: now,
            updatedAt: now,
            hostPath
        };
        this.volumes.set(volumeId, stored);
        return this.toPublicVolume(stored);
    }

    /**
     * Releases a volume and optionally deletes its data.
     * 
     * @param volumeId Volume identifier
     * @param deleteData Whether to delete underlying data
     * @returns Nothing.
     */
    async release(volumeId: string, deleteData = false): Promise<void> {
        const volume = this.volumes.get(volumeId);
        if (!volume) {
            console.debug("[volumes] release missing volumeId=%s", volumeId);
            return;
        }

        console.debug("[volumes] release volumeId=%s deleteData=%s", volumeId, deleteData);
        volume.status = "deleting";
        volume.updatedAt = new Date().toISOString();

        if (deleteData) {
            await rm(volume.hostPath, { recursive: true, force: true });
        }

        this.volumes.delete(volumeId);
    }

    /**
     * Resolves the host path for a volume on a specific node.
     * 
     * @param volumeId Volume identifier
     * @param nodeId Node identifier hosting the volume
     * @returns Absolute host path when available
     */
    async resolveHostPath(volumeId: string, nodeId: string): Promise<string | undefined> {
        const volume = this.volumes.get(volumeId);
        if (!volume) {
            console.debug("[volumes] resolveHostPath missing volumeId=%s", volumeId);
            return undefined;
        }

        if (volume.nodeId && volume.nodeId !== nodeId) {
            console.debug("[volumes] resolveHostPath node mismatch volumeId=%s nodeId=%s", volumeId, nodeId);
            return undefined;
        }

        console.debug("[volumes] resolveHostPath volumeId=%s path=%s", volumeId, volume.hostPath);
        return volume.hostPath;
    }

    /**
     * Strips internal storage fields before returning volume metadata.
     * 
     * @param volume Stored volume record
     * @returns Public volume metadata
     */
    private toPublicVolume(volume: StoredVolume): Volume {
        return {
            id: volume.id,
            name: volume.name,
            manifestName: volume.manifestName,
            scope: volume.scope,
            nodeId: volume.nodeId,
            mountPath: volume.mountPath,
            sizeMb: volume.sizeMb,
            status: volume.status,
            backup: volume.backup,
            createdAt: volume.createdAt,
            updatedAt: volume.updatedAt
        };
    }
}

/**
 * Creates a local cluster-scoped volume provider.
 * 
 * @param options Provider options including the storage root directory
 * @returns Configured volume provider
 */
export function createLocalVolumeProvider(options: LocalVolumeProviderOptions): LocalVolumeProvider {
    return new LocalVolumeProvider(options);
}
