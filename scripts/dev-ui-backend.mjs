/**
 * Starts the admin API (BFF) for local UI development.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createDevWatcher, isDevReuseEnabled, runCommand, waitForShutdownSignal } from "./dev-watch.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backendRoot = path.join(repoRoot, "packages/ui/packages/backend");
const sharedRoot = path.join(repoRoot, "packages/nodejs/shared");
const sdkRoot = path.join(repoRoot, "packages/sdk");
const loggerRoot = path.join(repoRoot, "packages", "nodejs", "logger");

process.env.CONTROL_PLANE_INSTANCES ??= "http://localhost:18080";
process.env.PORT = process.env.NAULITE_UI_BACKEND_PORT ?? "3001";
process.env.HOST = process.env.NAULITE_UI_BACKEND_HOST ?? "0.0.0.0";
const adminApiPort = process.env.PORT;
const adminApiHost = process.env.HOST;

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
 * Builds shared dependencies and the admin API bundle.
 *
 * @returns `true` when every compile step succeeded
 */
function buildAdminApi() {
    if (!runCommand("yarn", ["workspace", "@naulite/shared", "build"], {
        cwd: repoRoot,
        label: "dev-ui-backend"
    })) {
        return false;
    }

    if (!runCommand("yarn", ["workspace", "@naulite/sdk", "build"], {
        cwd: repoRoot,
        label: "dev-ui-backend"
    })) {
        return false;
    }

    if (!runCommand("yarn", ["workspace", "@naulite/logger", "build"], {
        cwd: repoRoot,
        label: "dev-ui-backend"
    })) {
        return false;
    }

    if (!runCommand("yarn", ["tsc", "-p", "tsconfig.json"], {
        cwd: backendRoot,
        label: "dev-ui-backend"
    })) {
        return false;
    }

    return runCommand("node", ["../../../../scripts/fix-esm-imports.mjs", "dist"], {
        cwd: backendRoot,
        label: "dev-ui-backend"
    });
}

/**
 * Starts the admin API HTTP server.
 *
 * @returns Started server handle
 */
async function startAdminApiServer() {
    const serverModuleUrl = new URL("../packages/ui/packages/backend/dist/Server.js", import.meta.url);

    // Bust the ESM cache so a watch rebuild actually reloads route modules
    const { startServer } = await import(`${serverModuleUrl.href}?t=${Date.now()}`);

    return startServer();
}

const adminApiUrl = `http://127.0.0.1:${adminApiPort}/auth/me`;
let server = null;
let managingDevAdminApi = false;
const canReuseAdminApi = isDevReuseEnabled();

if (canReuseAdminApi && await isReachable(adminApiUrl)) {
    console.log(`[dev] reusing admin API at http://${adminApiHost}:${adminApiPort}`);
} else {
    if (!canReuseAdminApi && await isReachable(adminApiUrl)) {
        console.warn(
            `[dev] admin API already listening on http://${adminApiHost}:${adminApiPort}; watched restarts are skipped until you stop it or set NAULITE_DEV_REUSE=1.`
        );
    } else {
        managingDevAdminApi = true;

        if (buildAdminApi()) {
            server = await startAdminApiServer();
            console.log(`[dev] Naulite admin API listening on http://${server.host}:${server.port}`);
        } else {
            console.error("[dev] admin API build failed; fix TypeScript errors and save to retry.");
        }
    }
}

console.log(`[dev] Control plane: ${process.env.CONTROL_PLANE_INSTANCES}`);

if (managingDevAdminApi) {
    createDevWatcher({
        label: "dev-ui-backend",
        paths: [
            path.join(backendRoot, "src"),
            path.join(sharedRoot, "src"),
            path.join(sdkRoot, "src"),
            path.join(loggerRoot, "src")
        ],
        onChange: async () => {
            if (!buildAdminApi()) {
                console.error("[dev-ui-backend] rebuild failed; keeping the previous server until the next successful build.");
                return;
            }

            if (server) {
                await server.stop();
                server = null;
            }

            server = await startAdminApiServer();
            console.log(`[dev] admin API restarted on http://${server.host}:${server.port}`);
        }
    });
}

const shutdown = async () => {
    if (managingDevAdminApi && server) {
        await server.stop();
    }

    process.exit(0);
};

await waitForShutdownSignal();
await shutdown();
