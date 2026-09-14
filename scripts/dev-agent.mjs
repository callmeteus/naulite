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
import { createDevWatcher, waitForShutdownSignal } from "./dev-watch.mjs";
import { ZigToolchain } from "./zig-toolchain.mjs";

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

/** Windows flag that prevents a visible console window for child processes. */
const WINDOWS_CREATE_NO_WINDOW = 0x08000000;

/**
 * Spawns a child process without opening a desktop console on Windows.
 *
 * @param command Executable path
 * @param args Command arguments
 * @param options `node:child_process` spawn options
 * @returns Child process handle
 */
function spawnHidden(command, args, options = {}) {
    return spawn(command, args, {
        ...options,
        windowsHide: true,
        ...(process.platform === "win32"
            ? { creationFlags: WINDOWS_CREATE_NO_WINDOW }
            : {})
    });
}

/**
 * Returns whether an HTTP health endpoint responds successfully.
 *
 * @param url Health check URL
 * @param timeoutMs Request timeout in milliseconds
 * @returns `true` when the endpoint returns a 2xx status
 */
async function isHealthy(url, timeoutMs = 5_000) {
    try {
        const response = await fetch(url, {
            signal: AbortSignal.timeout(timeoutMs)
        });

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

    const pinnedVersion = ZigToolchain.loadPinnedVersion(repoRoot);
    const installedVersion = ZigToolchain.readInstalledVersion();

    // Skip host Zig that cannot compile `std.process.Init` (requires 0.16.0)
    if (!ZigToolchain.isCompatible(installedVersion, pinnedVersion)) {
        console.warn(
            `[dev-agent] host zig ${installedVersion || "missing"} does not match pinned ${pinnedVersion}; using Docker fallback`
        );
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
        NAULITE_AGENT_CONFIG: agentConfigPath.split(path.sep).join("/"),
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

    const child = spawnHidden(hostBinaryPath, [], {
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
 * Stops processes that are listening on the dev agent port.
 *
 * @param port TCP port to free
 * @returns Number of processes terminated
 */
function killListenersOnPort(port) {
    if (process.platform === "win32") {
        const result = spawnSync("netstat", ["-ano"], { encoding: "utf8" });
        const lines = result.stdout?.split(/\r?\n/) ?? [];
        const pids = new Set();

        for (const line of lines) {
            if (!line.includes(`:${port}`) || !line.includes("LISTENING")) {
                continue;
            }

            const parts = line.trim().split(/\s+/);
            const pid = parts.at(-1);

            if (pid && pid !== "0") {
                pids.add(pid);
            }
        }

        for (const pid of pids) {
            spawnSync("taskkill", ["/PID", pid, "/F"], { stdio: "ignore" });
        }

        return pids.size;
    }

    const result = spawnSync("lsof", ["-ti", `tcp:${port}`], { encoding: "utf8" });

    if (result.status !== 0 || !result.stdout?.trim()) {
        return 0;
    }

    const pids = result.stdout.trim().split(/\s+/);

    for (const pid of pids) {
        spawnSync("kill", ["-9", pid], { stdio: "ignore" });
    }

    return pids.length;
}

/**
 * Clears stale Docker and host listeners before starting a fresh dev agent.
 *
 * @returns Nothing.
 */
function resetAgentPort() {
    stopDockerAgent();

    const killed = killListenersOnPort(agentPort);

    if (killed > 0) {
        console.log(`[dev-agent] freed port ${agentPort} (${killed} process(es) stopped)`);
    }
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

    resetAgentPort();

    let hostChild = null;
    let ownsDockerAgent = false;

    const preferHostOnWindows = process.platform === "win32";

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

    if (!hostChild && !preferHostOnWindows) {
        ownsDockerAgent = await startDockerAgent(setupKey);

        if (!ownsDockerAgent) {
            return {
                hostChild: null,
                ownsDockerAgent: false
            };
        }

        await waitForHealthy(agentHealthUrl, 120_000);
        console.log(`[dev-agent] Docker agent ready at ${agentHealthUrl}`);
    } else
    if (!hostChild && preferHostOnWindows) {
        console.error(
            "[dev-agent] host Zig agent is required on Windows dev. Build with `zig build` in packages/agent."
        );
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
        "[dev-agent] could not start a local agent on the first attempt. The watchdog will keep retrying."
    );
    console.warn("[dev-agent] You can also add a node manually from Nodes > Add node.");
} else {
    console.log(`[dev-agent] registered against ${controlPlaneUrl}`);
}

const agentWatchPaths = [
    path.join(repoRoot, "packages", "agent", "src"),
    path.join(repoRoot, "packages", "agent", "build.zig"),
    path.join(repoRoot, "packages", "agent", "build.zig.zon")
];

createDevWatcher({
    label: "dev-agent",
    paths: agentWatchPaths,
    debounceMs: 1500,
    onChange: async () => {
        console.log("[dev-agent] rebuilding agent after source change...");
        stopOwnedAgent(ownedAgent);
        resetAgentPort();
        ownedAgent = await ensureLocalAgent(setupKey);

        if (await isHealthy(agentHealthUrl)) {
            console.log(`[dev-agent] agent restarted at ${agentHealthUrl}`);
        } else {
            console.error("[dev-agent] agent restart failed after source change");
        }
    }
});

const watchdog = setInterval(() => {
    void (async () => {
        if (await isHealthy(agentHealthUrl)) {
            return;
        }

        console.warn("[dev-agent] agent is not healthy, attempting restart...");
        stopOwnedAgent(ownedAgent);
        resetAgentPort();
        ownedAgent = await ensureLocalAgent(setupKey);

        if (await isHealthy(agentHealthUrl)) {
            console.log(`[dev-agent] agent recovered at ${agentHealthUrl}`);
        } else {
            console.error("[dev-agent] agent restart failed");
        }
    })();
}, 15_000);

await waitForShutdownSignalLegacy();

clearInterval(watchdog);
stopOwnedAgent(ownedAgent);

process.exit(0);
