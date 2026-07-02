/**
 * Error thrown when a runtime backend is not configured on the node.
 */
export class RuntimeNotConfiguredError extends Error {
    /**
     * Creates a runtime-not-configured error.
     * 
     * @param runtime Runtime identifier such as podman or containerd
     */
    constructor(runtime: string) {
        super(`${runtime} runtime is not configured on this node`);
        this.name = "RuntimeNotConfiguredError";
    }
}
