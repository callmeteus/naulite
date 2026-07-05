import type { ProvisionVolumeOptions, Volume } from "@naulite/shared";

/**
 * Abstract volume provider contract for local and plugin storage backends.
 */
export abstract class VolumeProvider {
    /**
     * Lists volumes known to the control plane.
     *
     * @returns Volume metadata entries
     */
    abstract list(): Promise<Volume[]>;

    /**
     * Provisions or binds a volume on the selected node.
     *
     * @param options Volume provisioning options
     * @returns Provisioned volume metadata
     */
    abstract provision(options: ProvisionVolumeOptions): Promise<Volume>;

    /**
     * Releases a volume and optionally deletes its data.
     *
     * @param volumeId Volume identifier
     * @param deleteData Whether to delete underlying data
     * @returns Nothing.
     */
    abstract release(volumeId: string, deleteData?: boolean): Promise<void>;

    /**
     * Resolves the host path for a volume on a specific node.
     *
     * @param volumeId Volume identifier
     * @param nodeId Node identifier hosting the volume
     * @returns Absolute host path when available
     */
    abstract resolveHostPath(volumeId: string, nodeId: string): Promise<string | undefined>;
}
