import type { Volume } from "../types/Volume";

/**
 * Options for provisioning a cluster volume on a node.
 */
export interface ProvisionVolumeOptions {
    volumeName: string;
    mountPath: string;
    nodeId?: string;
    sizeMb?: number;
}

/**
 * Volume provider contract for local and replicated storage backends.
 */
export interface VolumeProvider {
    /**
     * Lists volumes known to the control plane.
     * 
     * @returns Volume metadata entries
     */
    list(): Promise<Volume[]>;

    /**
     * Provisions or binds a volume on the selected node.
     * 
     * @param options Volume provisioning options
     * @returns Provisioned volume metadata
     */
    provision(options: ProvisionVolumeOptions): Promise<Volume>;

    /**
     * Releases a volume and optionally deletes its data.
     * 
     * @param volumeId Volume identifier
     * @param deleteData Whether to delete underlying data
     * @returns Nothing.
     */
    release(volumeId: string, deleteData?: boolean): Promise<void>;

    /**
     * Resolves the host path for a volume on a specific node.
     * 
     * @param volumeId Volume identifier
     * @param nodeId Node identifier hosting the volume
     * @returns Absolute host path when available
     */
    resolveHostPath(volumeId: string, nodeId: string): Promise<string | undefined>;
}
