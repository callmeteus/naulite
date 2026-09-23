/**
 * Starts the control plane for local UI development on a non-default port.
 *
 * Defaults to 18080 so it does not collide with other Fastify apps on 8080.
 * Reuses traefik-mock and an existing control plane when their health checks pass.
 */
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DevAgentHelpers } from "./dev-agent-helpers.mjs";
import { isDockerAvailable } from "./dev-docker.mjs";
import { createDevWatcher, isDevReuseEnabled, runCommand, waitForShutdownSignal } from "./dev-watch.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const traefikMockPort = process.env.NAULITE_TRAEFIK_MOCK_PORT ?? "18099";
const prometheusPort = process.env.NAULITE_PROMETHEUS_HOST_PORT ?? "19090";

process.env.PORT = process.env.NAULITE_CP_PORT ?? "18080";
process.env.HOST = process.env.NAULITE_CP_HOST ?? "0.0.0.0";
const controlPlanePort = process.env.PORT;
const controlPlaneHost = process.env.HOST;

process.env.NAULITE_BOOTSTRAP_ADMIN_USERNAME ??= "admin@example.com";
process.env.NAULITE_BOOTSTRAP_ADMIN_PASSWORD ??= "admin";
process.env.NAULITE_AGENT_API_KEY ??= DevAgentHelpers.DEFAULT_API_KEY;
process.env.NAULITE_ALLOW_DOCKER_BRIDGE ??= "1";
process.env.NAULITE_NETBIRD_MOCK ??= "1";
process.env.NAULITE_PUBLIC_URL ??= `http://127.0.0.1:${controlPlanePort}`;
process.env.NETBIRD_PUBLIC_MANAGEMENT_URL ??= "http://127.0.0.1:9081";
process.env.NETBIRD_MANAGEMENT_URL ??= process.env.NETBIRD_PUBLIC_MANAGEMENT_URL;
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
function waitForShutdownSignalLegacy() {
    return waitForShutdownSignal();
}

/**
 * Workspace packages that the control plane imports at compile time.
 *
 * Shared is built separately first because these packages depend on it.
 * Keep this list in sync with `@naulite/*` dependencies in
 * `packages/control-plane/package.json` except `@naulite/shared`.
 */
const controlPlaneProviderPackages = [
    "@naulite/logger",
    "@naulite/builder-docker",
    "@naulite/builder-kaniko",
    "@naulite/gateway",
    "@naulite/runtime-containerd",
    "@naulite/runtime-docker",
    "@naulite/runtime-podman",
    "@naulite/plugin-notification-slack",
    "@naulite/plugin-notification-webhook"
];

/**
 * Builds a single workspace package.
 *
 * @param name Workspace package name
 * @returns `true` when the workspace build succeeded
 */
function buildWorkspacePackage(name) {
    return runCommand("yarn", ["workspace", name, "build"], {
        cwd: repoRoot,
        label: "dev-control-plane"
    });
}

/**
 * Builds shared, provider packages, and the control-plane bundle.
 *
 * Provider packages ship types from `dist/`. Skipping them makes `tsc` fail
 * with TS2307 on a fresh clone (`yarn install && yarn dev`).
 *
 * @param options Build flags
 * @param options.includeProviders When `true`, also compile logger, builder,
 * runtime, gateway, and notification packages. Use on first start; watch
 * reloads can skip them when those trees did not change.
 * @returns `true` when every compile step succeeded
 */
function buildControlPlane(options = {}) {
    const includeProviders = options.includeProviders === true;

    if (!buildWorkspacePackage("@naulite/shared")) {
        return false;
    }

    // Compile workspace providers so control-plane `tsc` can resolve `@naulite/*`
    if (includeProviders) {
        for (const name of controlPlaneProviderPackages) {
            if (!buildWorkspacePackage(name)) {
                return false;
            }
        }
    }

    return buildWorkspacePackage("@naulite/control-plane");
}

/**
 * Starts the control plane HTTP server from the compiled dist bundle.
 *
 * @returns Started server handle
 */
async function startControlPlaneServer() {
    const serverModuleUrl = new URL("../packages/control-plane/dist/Server.js", import.meta.url);

    // Bust the ESM cache so a watch rebuild actually reloads MigrationRunner
    const { startServer } = await import(`${serverModuleUrl.href}?t=${Date.now()}`);

    return startServer();
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

    if (await isDockerAvailable()) {
        process.env.NAULITE_PROMETHEUS_SCRAPE_HOST ??= "host.docker.internal";
    }

    console.log(`[dev] Prometheus ready at http://127.0.0.1:${prometheusPort}`);
} else {
    delete process.env.PROMETHEUS_URL;
    console.warn(`[dev] Prometheus not available on port ${prometheusPort}; metrics queries return 503 until Docker is running.`);
}

const controlPlaneHealthUrl = `http://127.0.0.1:${controlPlanePort}/health`;
let server = null;
let managingDevControlPlane = false;

const canReuseControlPlane = isDevReuseEnabled();

if (canReuseControlPlane && await isHealthy(controlPlaneHealthUrl)) {
    console.log(`[dev] reusing control plane at http://${controlPlaneHost}:${controlPlanePort}`);
    console.warn("[dev] Reused control plane will not reload code until you stop it or unset NAULITE_DEV_REUSE.");
} else {
    if (!canReuseControlPlane && await isHealthy(controlPlaneHealthUrl)) {
        console.warn(
            `[dev] control plane already listening on http://${controlPlaneHost}:${controlPlanePort}; starting a watched instance is skipped. Stop the other process or set NAULITE_DEV_REUSE=1 to reuse it.`
        );
    } else {
        managingDevControlPlane = true;

        if (buildControlPlane({ includeProviders: true })) {
            server = await startControlPlaneServer();
            console.log(`[dev] Naulite control plane listening on http://${server.host}:${server.port}`);
        } else {
            console.error("[dev] control plane build failed; fix TypeScript errors and save to retry.");
        }
    }
}

console.log(`[dev] traefik-mock at http://127.0.0.1:${traefikMockPort}`);
console.log(`[dev] Prometheus URL for CP: ${process.env.PROMETHEUS_URL ?? "(disabled)"}`);
console.log("[dev] Bootstrap login: admin@example.com / admin");

if (managingDevControlPlane) {
    createDevWatcher({
        label: "dev-control-plane",
        paths: [
            path.join(repoRoot, "packages", "control-plane", "src"),
            path.join(repoRoot, "packages", "nodejs", "shared", "src")
        ],
        onChange: async () => {
            if (!buildControlPlane()) {
                console.error("[dev-control-plane] rebuild failed; keeping the previous server until the next successful build.");
                return;
            }

            if (server) {
                await server.stop();
                server = null;
            }

            server = await startControlPlaneServer();
            console.log(`[dev] control plane restarted on http://${server.host}:${server.port}`);
        }
    });
}

const shutdown = async () => {
    if (managingDevControlPlane && server) {
        await server.stop();
    }

    if (traefikMock.owned && traefikMock.process && !traefikMock.process.killed) {
        traefikMock.process.kill();
    }

    process.exit(0);
};

await waitForShutdownSignalLegacy();
await shutdown();
