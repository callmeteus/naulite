/**
 * Starts the control plane for local UI development on a non-default port.
 *
 * Defaults to 18080 so it does not collide with other Fastify apps on 8080.
 * Reuses traefik-mock and an existing control plane when their health checks pass.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isDockerAvailable } from "./dev-docker.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const traefikMockPort = process.env.NAULITE_TRAEFIK_MOCK_PORT ?? "18099";
const prometheusPort = process.env.NAULITE_PROMETHEUS_HOST_PORT ?? "19090";

/**
 * Runs a command and exits the process when it fails.
 *
 * @param command Executable name
 * @param args Command arguments
 */
function run(command, args) {
    const result = spawnSync(command, args, {
        cwd: repoRoot,
        stdio: "inherit",
        env: process.env,
        shell: true
    });

    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}

process.env.PORT = process.env.NAULITE_CP_PORT ?? "18080";
process.env.HOST = process.env.NAULITE_CP_HOST ?? "127.0.0.1";
const controlPlanePort = process.env.PORT;
const controlPlaneHost = process.env.HOST;

process.env.NAULITE_BOOTSTRAP_ADMIN_USERNAME ??= "admin@local.dev";
process.env.NAULITE_BOOTSTRAP_ADMIN_PASSWORD ??= "naulite-dev";
process.env.NAULITE_NETBIRD_MOCK ??= "1";
process.env.TRAEFIK_DYNAMIC_CONFIG_URL ??= `http://127.0.0.1:${traefikMockPort}/naulite/dynamic-config`;
process.env.NAULITE_PROMETHEUS_FILE_SD_DIR ??= path.join(repoRoot, "data", "prometheus", "file_sd");
const prometheusHealthUrl = `http://127.0.0.1:${prometheusPort}/-/healthy`;
process.env.DATABASE_PATH ??= path.join(repoRoot, "data", "control-plane.db");

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
 * Waits until an HTTP health endpoint responds successfully.
 *
 * @param url Health check URL
 * @param timeoutMs Maximum wait time in milliseconds
 * @returns Nothing.
 */
async function waitForHealthy(url, timeoutMs = 10_000) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        if (await isHealthy(url)) {
            return;
        }

        await new Promise((resolve) => {
            setTimeout(resolve, 100);
        });
    }

    throw new Error(`Service did not become ready at ${url}`);
}

/**
 * Starts traefik-mock when it is not already listening.
 *
 * @returns Child process handle and ownership flag
 */
async function ensureTraefikMock() {
    const healthUrl = `http://127.0.0.1:${traefikMockPort}/health`;

    if (await isHealthy(healthUrl)) {
        console.log(`[dev] reusing traefik-mock at http://127.0.0.1:${traefikMockPort}`);
        return { process: null, owned: false };
    }

    const scriptPath = path.join(repoRoot, "tests/fixtures/traefik-mock/server.mjs");
    const child = spawn(process.execPath, [scriptPath], {
        env: {
            ...process.env,
            PORT: traefikMockPort
        },
        stdio: ["ignore", "pipe", "pipe"]
    });

    child.stdout.on("data", (chunk) => {
        const line = chunk.toString().trimEnd();

        if (line) {
            console.log(`[traefik-mock] ${line}`);
        }
    });

    child.stderr.on("data", (chunk) => {
        const line = chunk.toString().trimEnd();

        if (line) {
            console.error(`[traefik-mock] ${line}`);
        }
    });

    child.on("error", (error) => {
        console.error("[traefik-mock] failed to start: %s", error.message);
    });

    await waitForHealthy(healthUrl);

    return { process: child, owned: true };
}

/**
 * Waits until the process receives SIGINT or SIGTERM.
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
 * Waits until Prometheus responds on the dev health endpoint.
 *
 * @param timeoutMs Maximum wait time in milliseconds
 * @returns `true` when Prometheus is healthy
 */
async function waitForPrometheus(timeoutMs = 120_000) {
    if (!await isDockerAvailable()) {
        return false;
    }

    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        if (await isHealthy(prometheusHealthUrl)) {
            return true;
        }

        await new Promise((resolve) => {
            setTimeout(resolve, 500);
        });
    }

    return false;
}

const traefikMock = await ensureTraefikMock();

await mkdir(process.env.NAULITE_PROMETHEUS_FILE_SD_DIR, { recursive: true });

const prometheusReady = await waitForPrometheus();

if (prometheusReady) {
    process.env.PROMETHEUS_URL ??= `http://127.0.0.1:${prometheusPort}`;
    console.log(`[dev] Prometheus ready at http://127.0.0.1:${prometheusPort}`);
} else {
    delete process.env.PROMETHEUS_URL;
    console.warn(`[dev] Prometheus not available on port ${prometheusPort}; metrics queries return 503 until Docker is running.`);
}

const controlPlaneHealthUrl = `http://127.0.0.1:${controlPlanePort}/health`;
let server = null;
let ownsControlPlane = false;

if (await isHealthy(controlPlaneHealthUrl)) {
    console.log(`[dev] reusing control plane at http://${controlPlaneHost}:${controlPlanePort}`);
    console.warn("[dev] Reused control plane may miss new routes until you stop the process on this port and restart yarn dev.");

    if (!prometheusReady) {
        console.warn("[dev] Reused control plane may still proxy metrics to Prometheus. Restart yarn dev after Docker is up.");
    }
} else {
    run("yarn", ["workspace", "@naulite/shared", "build"]);
    run("yarn", ["workspace", "@naulite/control-plane", "build"]);

    const { startServer } = await import(new URL("../packages/control-plane/dist/Server.js", import.meta.url).href);

    server = await startServer();
    ownsControlPlane = true;

    console.log(`[dev] Naulite control plane listening on http://${server.host}:${server.port}`);
}

console.log(`[dev] traefik-mock at http://127.0.0.1:${traefikMockPort}`);
console.log(`[dev] Prometheus URL for CP: ${process.env.PROMETHEUS_URL ?? "(disabled)"}`);
console.log("[dev] Bootstrap login: admin@local.dev / naulite-dev");

const shutdown = async () => {
    if (ownsControlPlane && server) {
        await server.stop();
    }

    if (traefikMock.owned && traefikMock.process && !traefikMock.process.killed) {
        traefikMock.process.kill();
    }

    process.exit(0);
};

await waitForShutdownSignal();
await shutdown();
