/**
 * Debounced file watching helpers for Naulite dev scripts.
 */
import { spawnSync } from "node:child_process";

import chokidar from "chokidar";

/**
 * Starts a debounced watcher that runs a callback when source files change.
 *
 * @param options Watcher configuration
 * @returns Chokidar watcher instance
 */
export function createDevWatcher(options) {
    const {
        label,
        paths,
        onChange,
        debounceMs = 500,
        ignored = [/node_modules/, /(^|[\\/])dist([\\/]|$)/, /\.git/]
    } = options;

    let debounceTimer = null;
    let running = false;
    let rerunRequested = false;

    const run = async () => {
        if (running) {
            rerunRequested = true;
            return;
        }

        running = true;

        try {
            await onChange();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[${label}] watch rebuild failed: %s`, message);
        } finally {
            running = false;

            if (rerunRequested) {
                rerunRequested = false;
                await run();
            }
        }
    };

    const schedule = () => {
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }

        debounceTimer = setTimeout(() => {
            debounceTimer = null;
            console.log(`[${label}] source changed, rebuilding...`);
            void run();
        }, debounceMs);
    };

    const watcher = chokidar.watch(paths, {
        ignoreInitial: true,
        ignored
    });

    watcher.on("all", schedule);

    return watcher;
}

/**
 * Waits until the process receives SIGINT or SIGTERM.
 *
 * @returns Promise resolved by the first shutdown signal
 */
export function waitForShutdownSignal() {
    return new Promise((resolve) => {
        const keepAlive = setInterval(() => {}, 60 * 60 * 1000);

        const finish = () => {
            clearInterval(keepAlive);
            resolve();
        };

        process.once("SIGINT", finish);
        process.once("SIGTERM", finish);
    });
}

/**
 * Returns whether dev scripts may reuse an already-running HTTP service.
 *
 * @returns `true` when reuse is enabled
 */
export function isDevReuseEnabled() {
    return process.env.NAULITE_DEV_REUSE === "1";
}

/**
 * Runs a shell command without exiting the dev process when it fails.
 *
 * @param command Executable name
 * @param args Command arguments
 * @param options Optional cwd and log label
 * @returns `true` when the command exits with status 0
 */
export function runCommand(command, args, options = {}) {
    const cwd = options.cwd ?? process.cwd();
    const result = spawnSync(command, args, {
        cwd,
        stdio: "inherit",
        env: process.env,
        shell: true
    });

    const ok = result.status === 0;

    if (!ok && options.label) {
        console.error(
            `[%s] command failed (exit %s): %s %s`,
            options.label,
            String(result.status ?? 1),
            command,
            args.join(" ")
        );
    }

    return ok;
}
