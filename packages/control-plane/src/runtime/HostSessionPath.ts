/**
 * Per-host PATH session state (nvm after install).
 */
export namespace HostSessionPath {
    export interface SessionState {
        pathEntries: string[];
        nvmDir?: string;
    }

    /**
     * Creates an empty session state.
     *
     * @returns Fresh session state
     */
    export function create(): SessionState {
        return {
            pathEntries: []
        };
    }

    /**
     * Records nvm install side effects on the session PATH.
     *
     * @param state Session state
     * @param version Installed node version
     * @param nvmDir NVM directory (default ~/.nvm)
     * @returns Nothing.
     */
    export function applyNvmInstall(state: SessionState, version: string, nvmDir = "~/.nvm"): void {
        state.nvmDir = nvmDir;
        const versionPath = `${nvmDir}/versions/node/v${version}/bin`;
        state.pathEntries = [versionPath, ...state.pathEntries.filter((entry) => entry !== versionPath)];
    }

    /**
     * Resolves whether `node` is available on the session PATH.
     *
     * @param state Session state
     * @returns True when a node binary path was registered
     */
    export function hasNodeOnPath(state: SessionState): boolean {
        return state.pathEntries.some((entry) => entry.includes("/node/v"));
    }
}
