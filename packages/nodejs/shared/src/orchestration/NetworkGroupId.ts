/**
 * Derives NetBird group identifiers from manifest metadata.
 */
export const NetworkGroupId = {
    /**
     * Builds the NetBird group id from manifest name and network key.
     * 
     * @param manifestName Top-level manifest `name` field
     * @param networkKey Network key from the manifest `networks` block
     * @returns NetBird group id in the form `${manifestName}-${networkKey}`
     * @throws {Error} {@link Error}
     */
    generate(manifestName: string, networkKey: string): string {
        const name = manifestName.trim();
        const key = networkKey.trim();

        if (!name || !key) {
            throw new Error("manifest name and network key are required");
        }

        return `${name}-${key}`;
    },

    /**
     * Returns whether a NetBird group should be created for the network.
     * 
     * @param network Network definition from the manifest
     * @returns `true` when the network is not marked as local-only
     */
    shouldSyncNetBirdGroup(network: { local?: boolean }): boolean {
        return network.local !== true;
    }
};
