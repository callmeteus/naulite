/**
 * Docker readiness helpers for Naulite dev scripts via ensure-running.
 */
import { ensureDocker, isDockerRunning } from "ensure-running";

/**
 * Returns whether the Docker daemon is reachable.
 *
 * @returns `true` when Docker responds
 */
export async function isDockerAvailable() {
    return isDockerRunning();
}

/**
 * Ensures Docker is installed, started, and ready for compose commands.
 *
 * @param options Optional ensure-running docker options
 * @returns `true` when Docker is ready
 */
export async function ensureDockerReady(options = {}) {
    try {
        await ensureDocker({
            quiet: true,
            autoStart: options.autoStart ?? true,
            timeout: options.timeout ?? 120_000,
            interval: options.interval ?? 1_000,
            check: options.check ?? false
        });

        return true;
    } catch {
        return false;
    }
}
