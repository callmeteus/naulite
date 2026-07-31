/**
 * Starts Prometheus for local UI development via Docker Compose.
 *
 * Defaults to host port 19090 (see PORTS.md).
 * When Docker is unavailable, logs a warning and keeps running so yarn dev still works.
 */
import { spawnSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ensureDockerReady } from "./dev-docker.mjs";
import { isHostPrometheusSupported, startHostPrometheus } from "./dev-prometheus-host.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const prometheusPort = process.env.NAULITE_PROMETHEUS_HOST_PORT ?? "19090";
const controlPlanePort = process.env.NAULITE_CP_PORT ?? "18080";
const composeFile = path.join(repoRoot, "packages/metrics/compose/metrics-dev.yml");
const fileSdDir = path.join(repoRoot, "data", "prometheus", "file_sd");
const healthUrl = `http://127.0.0.1:${prometheusPort}/-/healthy`;

/** @type {import("node:child_process").ChildProcess | null} */
let hostPrometheusProcess = null;

/**
 * Returns whether an HTTP health endpoint responds successfully.
 *
 * @param url Health check URL
 * @returns `true` when the endpoint returns a 2xx status
 */
async function isHealthy(url) {
    try {
        const response = await fetch(url);

        return response.ok;
    } catch {
        return false;
    }
}

/**
 * Waits until Prometheus responds on the health endpoint.
 *
 * @param url Health check URL
 * @param timeoutMs Maximum wait time in milliseconds
 * @returns `true` when healthy before timeout
 */
async function waitForHealthy(url, timeoutMs = 60_000) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        if (await isHealthy(url)) {
            return true;
        }

        await new Promise((resolve) => {
            setTimeout(resolve, 500);
        });
    }

    return false;
}

/**
 * Runs docker compose for the dev metrics stack.
 *
 * @param args Compose arguments
 * @returns Exit code
 */
function runCompose(args) {
    const result = spawnSync("docker", ["compose", "-f", composeFile, ...args], {
        cwd: repoRoot,
        stdio: "inherit",
        env: {
            ...process.env,
            NAULITE_PROMETHEUS_HOST_PORT: prometheusPort
        },
        shell: false
    });

    return result.status ?? 1;
}

/**
 * Blocks until the process receives SIGINT or SIGTERM.
 *
 * @returns Promise resolved by the first shutdown signal
 */
function waitForShutdownSignal() {
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
 * Attempts to start Prometheus via Docker Compose.
 *
 * @returns `true` when Prometheus is healthy
 */
async function ensureDockerPrometheusRunning() {
    if (await isHealthy(healthUrl)) {
        return true;
    }

    if (!await ensureDockerReady({ quiet: false, timeout: 120_000 })) {
        return false;
    }

    await mkdir(fileSdDir, { recursive: true });

    const exitCode = runCompose(["up", "-d", "--wait"]);

    return exitCode === 0 && await waitForHealthy(healthUrl);
}

/**
 * Attempts to start Prometheus as a host process.
 *
 * @returns `true` when Prometheus is healthy
 */
async function ensureHostPrometheusRunning() {
    if (await isHealthy(healthUrl)) {
        return true;
    }

    if (!isHostPrometheusSupported()) {
        return false;
    }

    if (hostPrometheusProcess && hostPrometheusProcess.exitCode === null) {
        return await waitForHealthy(healthUrl, 15_000);
    }

    try {
        hostPrometheusProcess = await startHostPrometheus({
            repoRoot,
            prometheusPort,
            controlPlanePort
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[dev-prometheus] host Prometheus failed to start: ${message}`);

        return false;
    }

    return await waitForHealthy(healthUrl, 60_000);
}

/**
 * Attempts to start or reuse dev Prometheus (Docker first, then host binary).
 *
 * @returns `true` when Prometheus is healthy
 */
async function ensurePrometheusRunning() {
    if (await isHealthy(healthUrl)) {
        return true;
    }

    if (await ensureDockerPrometheusRunning()) {
        return true;
    }

    console.warn("[dev-prometheus] Docker Prometheus unavailable, trying host binary...");

    return ensureHostPrometheusRunning();
}

if (await ensurePrometheusRunning()) {
    console.log(`[dev] Prometheus listening on http://127.0.0.1:${prometheusPort}`);
} else {
    console.warn("[dev] Prometheus is not ready yet on port 19090.");
    console.warn("[dev] Metrics charts stay empty until Prometheus starts. Retrying in the background...");

    setInterval(() => {
        void ensurePrometheusRunning().then((ready) => {
            if (ready) {
                console.log(`[dev] Prometheus is now listening on http://127.0.0.1:${prometheusPort}`);
            }
        });
    }, 30_000);
}

await waitForShutdownSignal();

if (hostPrometheusProcess && hostPrometheusProcess.exitCode === null) {
    hostPrometheusProcess.kill();
}
