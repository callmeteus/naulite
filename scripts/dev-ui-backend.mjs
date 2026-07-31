/**
 * Starts the admin API (BFF) for local UI development.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backendRoot = path.join(repoRoot, "packages/ui/packages/backend");

process.env.CONTROL_PLANE_INSTANCES ??= "http://localhost:18080";
process.env.PORT = process.env.NAULITE_UI_BACKEND_PORT ?? "3001";
process.env.HOST = process.env.NAULITE_UI_BACKEND_HOST ?? "0.0.0.0";
const adminApiPort = process.env.PORT;
const adminApiHost = process.env.HOST;

/**
 * Runs a command and exits the process when it fails.
 *
 * @param command Executable name
 * @param args Command arguments
 * @param cwd Working directory
 */
function run(command, args, cwd = repoRoot) {
    const result = spawnSync(command, args, {
        cwd,
        stdio: "inherit",
        env: process.env,
        shell: true
    });

    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}

/**
 * Returns whether an HTTP endpoint responds successfully.
 *
 * @param url Request URL
 * @returns `true` when the endpoint returns a 2xx status
 */
async function isReachable(url) {
    try {
        const response = await fetch(url);

        return response.ok || response.status === 401 || response.status === 404;
    } catch {
        return false;
    }
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

run("yarn", ["workspace", "@naulite/shared", "build"]);
run("yarn", ["workspace", "@naulite/sdk", "build"]);
run("yarn", ["workspace", "@naulite/logger", "build"]);
run("yarn", ["tsc", "-p", "tsconfig.json"], backendRoot);
run("node", ["../../../../scripts/fix-esm-imports.mjs", "dist"], backendRoot);

const adminApiUrl = `http://127.0.0.1:${adminApiPort}/auth/me`;
let server = null;
let ownsServer = false;

if (await isReachable(adminApiUrl)) {
    console.log(`[dev] reusing admin API at http://${adminApiHost}:${adminApiPort}`);
} else {
    const { startServer } = await import(new URL("../packages/ui/packages/backend/dist/Server.js", import.meta.url).href);

    server = await startServer();
    ownsServer = true;

    console.log(`[dev] Naulite admin API listening on http://${server.host}:${server.port}`);
}

console.log(`[dev] Control plane: ${process.env.CONTROL_PLANE_INSTANCES}`);

const shutdown = async () => {
    if (ownsServer && server) {
        await server.stop();
    }

    process.exit(0);
};

await waitForShutdownSignal();
await shutdown();
