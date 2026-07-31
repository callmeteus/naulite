/**
 * Starts a local Naulite agent for `yarn dev`.
 *
 * Reuses a healthy agent on port 9470 when present. Otherwise tries a host Zig
 * binary, then falls back to a single-container Docker agent.
 */
import { spawn, spawnSync } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ensureDockerReady, isDockerAvailable } from "./dev-docker.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const controlPlanePort = process.env.NAULITE_CP_PORT ?? "18080";
const controlPlaneHost = process.env.NAULITE_CP_HOST ?? "127.0.0.1";
const controlPlaneUrl = `http://${controlPlaneHost}:${controlPlanePort}`;
const agentPort = process.env.NAULITE_AGENT_PORT ?? "9470";
const agentHealthUrl = `http://127.0.0.1:${agentPort}/health`;
const agentBinaryName = process.platform === "win32" ? "naulite-agent.exe" : "naulite-agent";
const hostBinaryPath = path.join(repoRoot, "packages", "agent", "zig-out", "bin", agentBinaryName);
const agentConfigPath = path.join(repoRoot, "data", "dev-agent", "agent.json");
const composeFile = path.join(repoRoot, "scripts", "dev-agent.compose.yml");

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
async function waitForHealthy(url, timeoutMs = 60_000) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        if (await isHealthy(url)) {
            return;
        }

        await new Promise((resolve) => {
            setTimeout(resolve, 500);
        });
    }

    throw new Error(`Service did not become ready at ${url}`);
}

/**
 * Returns whether a command exists on PATH.
 *
 * @param command Executable name
 * @returns `true` when the command is available
 */
function hasCommand(command) {
    const checker = process.platform === "win32" ? "where" : "which";
    const result = spawnSync(checker, [command], { stdio: "ignore" });

    return result.status === 0;
}

/**
 * Builds the Zig agent binary when Zig is installed.
 *
 * @returns `true` when the binary exists after the build attempt
 */
async function ensureHostBinary() {
    try {
        await access(hostBinaryPath);

        return true;
    } catch {
        // Continue to build.
    }

    if (!hasCommand("zig")) {
        return false;
    }

    console.log("[dev-agent] building Zig agent (first run may take a minute)...");

    const buildScript = path.join(repoRoot, "scripts", "zig-build.mjs");
    const result = spawnSync(process.execPath, [buildScript, "-Doptimize=ReleaseSafe"], {
        cwd: path.join(repoRoot, "packages", "agent"),
        stdio: "inherit"
    });

    if (result.status !== 0) {
        return false;
    }

    try {
        await access(hostBinaryPath);

        return true;
    } catch {
        return false;
    }
}

/**
 * Fetches the local NetBird setup key when the control plane exposes it.
 *
 * @returns Setup key or undefined
 */
async function fetchSetupKey() {
    try {
        const response = await fetch(`${controlPlaneUrl}/bootstrap/setup-key`);

        if (!response.ok) {
            return undefined;
        }

        const payload = await response.json();

        return typeof payload.setupKey === "string" ? payload.setupKey : undefined;
    } catch {
        return undefined;
    }
}

/**
 * Builds shared agent environment variables.
 *
 * @param setupKey Optional NetBird setup key
 * @returns Environment object for the agent process
 */
function buildAgentEnv(setupKey) {
    const env = {
        ...process.env,
        NAULITE_CP_URL: controlPlaneUrl,
        NODE_ID: process.env.NAULITE_DEV_AGENT_ID ?? "dev-local",
        HOSTNAME: process.env.NAULITE_DEV_AGENT_HOSTNAME ?? os.hostname(),
        AGENT_URL: `http://127.0.0.1:${agentPort}`,
        AGENT_PORT: agentPort,
        NAULITE_AGENT_CONFIG: agentConfigPath,
        NAULITE_LOG_LEVEL: process.env.NAULITE_LOG_LEVEL ?? "info"
    };

    if (process.platform === "win32") {
        env.DOCKER_SOCKET = env.DOCKER_SOCKET ?? "//./pipe/docker_engine";
    }

    if (setupKey) {
        env.NETBIRD_SETUP_KEY = setupKey;
        env.NAULITE_SETUP_KEY = setupKey;
    }

    return env;
}

/**
 * Starts the agent as a host process.
 *
 * @param setupKey Optional NetBird setup key
 * @returns Child process handle
 */
async function startHostAgent(setupKey) {
    await mkdir(path.dirname(agentConfigPath), { recursive: true });

    const child = spawn(hostBinaryPath, [], {
        env: buildAgentEnv(setupKey),
        stdio: ["ignore", "pipe", "pipe"]
    });

    child.stdout.on("data", (chunk) => {
        const line = chunk.toString().trimEnd();

        if (line) {
            console.log(`[dev-agent] ${line}`);
        }
    });

    child.stderr.on("data", (chunk) => {
        const line = chunk.toString().trimEnd();

        if (line) {
            console.error(`[dev-agent] ${line}`);
        }
    });

    child.on("error", (error) => {
        console.error("[dev-agent] process error: %s", error.message);
    });

    return child;
}

/**
 * Starts the agent through Docker Compose.
 *
 * @param setupKey Optional NetBird setup key
 * @returns Whether Docker agent startup was attempted
 */
async function startDockerAgent(setupKey) {
    if (!await ensureDockerReady()) {
        return false;
    }

    const env = {
        ...process.env,
        NAULITE_CP_URL: controlPlaneUrl,
        NAULITE_AGENT_PORT: agentPort,
        NAULITE_DEV_AGENT_ID: process.env.NAULITE_DEV_AGENT_ID ?? "dev-local",
        NAULITE_DEV_AGENT_HOSTNAME: process.env.NAULITE_DEV_AGENT_HOSTNAME ?? os.hostname()
    };

    if (setupKey) {
        env.NETBIRD_SETUP_KEY = setupKey;
    }

    console.log("[dev-agent] starting Docker dev agent (first build may take a few minutes)...");

    const up = spawnSync(
        "docker",
        ["compose", "-f", composeFile, "up", "--build", "-d"],
        { cwd: repoRoot, env, stdio: "inherit", shell: process.platform === "win32" }
    );

    return up.status === 0;
}

/**
 * Stops the Docker dev agent container when this script owns it.
 *
 * @returns Nothing.
 */
function stopDockerAgent() {
    spawnSync(
        "docker",
        ["compose", "-f", composeFile, "down"],
        { cwd: repoRoot, stdio: "ignore", shell: process.platform === "win32" }
    );
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
 * Ensures a local agent is listening on the dev port.
 *
 * @param setupKey Optional NetBird setup key
 * @returns Running child process metadata
 */
async function ensureLocalAgent(setupKey) {
    if (await isHealthy(agentHealthUrl)) {
        console.log(`[dev-agent] agent already healthy at ${agentHealthUrl}`);
        return {
            hostChild: null,
            ownsDockerAgent: false
        };
    }

    let hostChild = null;
    let ownsDockerAgent = false;

    if (await ensureHostBinary()) {
        hostChild = await startHostAgent(setupKey);

        try {
            await waitForHealthy(agentHealthUrl, 45_000);
            console.log(`[dev-agent] host agent ready at ${agentHealthUrl}`);
        } catch (error) {
            console.error("[dev-agent] host agent failed to become healthy: %s", error.message);

            if (!hostChild.killed) {
                hostChild.kill();
            }

            hostChild = null;
        }
    }

    if (!hostChild) {
        ownsDockerAgent = await startDockerAgent(setupKey);

        if (!ownsDockerAgent) {
            return {
                hostChild: null,
                ownsDockerAgent: false
            };
        }

        await waitForHealthy(agentHealthUrl, 120_000);
        console.log(`[dev-agent] Docker agent ready at ${agentHealthUrl}`);
    }

    return {
        hostChild,
        ownsDockerAgent
    };
}

/**
 * Stops an owned local agent process.
 *
 * @param state Agent ownership state
 * @returns Nothing.
 */
function stopOwnedAgent(state) {
    if (state.hostChild && !state.hostChild.killed) {
        state.hostChild.kill();
    }

    if (state.ownsDockerAgent) {
        stopDockerAgent();
    }
}

console.log(`[dev-agent] waiting for control plane at ${controlPlaneUrl}/health ...`);
await waitForHealthy(`${controlPlaneUrl}/health`);

const setupKey = await fetchSetupKey();
let ownedAgent = await ensureLocalAgent(setupKey);

if (!await isHealthy(agentHealthUrl)) {
    console.warn(
        "[dev-agent] could not start a local agent. Install Zig or Docker, then restart yarn dev."
    );
    console.warn("[dev-agent] You can still connect a node manually from Nodes > Add node.");
    await waitForShutdownSignal();
    process.exit(0);
}

console.log(`[dev-agent] registered against ${controlPlaneUrl}`);

const watchdog = setInterval(() => {
    void (async () => {
        if (await isHealthy(agentHealthUrl)) {
            return;
        }

        console.warn("[dev-agent] agent is not healthy, attempting restart...");
        stopOwnedAgent(ownedAgent);
        ownedAgent = await ensureLocalAgent(setupKey);

        if (await isHealthy(agentHealthUrl)) {
            console.log(`[dev-agent] agent recovered at ${agentHealthUrl}`);
        } else {
            console.error("[dev-agent] agent restart failed");
        }
    })();
}, 15_000);

await waitForShutdownSignal();

clearInterval(watchdog);
stopOwnedAgent(ownedAgent);

process.exit(0);
