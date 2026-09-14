import type { HostExecutor } from "./HostExecutor";

/**
 * Process-wide host executor binding (production agent/SSH or test fake).
 */
export namespace HostExecutorProvider {
    let executor: HostExecutor | null = null;

    /**
     * Registers the active host executor implementation.
     *
     * @param implementation Host executor
     * @returns Nothing.
     */
    export function set(implementation: HostExecutor): void {
        executor = implementation;
    }

    /**
     * Clears the bound host executor (tests).
     *
     * @returns Nothing.
     */
    export function reset(): void {
        executor = null;
    }

    /**
     * Returns the configured host executor.
     *
     * @returns Host executor
     * @throws {Error} {@link Error}
     */
    export function get(): HostExecutor {
        if (!executor) {
            throw new Error("Host executor is not configured.");
        }

        return executor;
    }
}
