import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createServer, type Server } from "node:http";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import {
    assertBashSyntax,
    paths,
    readTextFile,
    resolveBashExecutable,
    runBootstrapScript
} from "./ShellRunner";

const bashAvailable = await resolveBashExecutable();
const describeBootstrap = bashAvailable ? describe : describe.skip;

describeBootstrap("agent-install.sh", () => {
    const tempDirs: string[] = [];

    afterEach(async () => {
        while (tempDirs.length > 0) {
            const dir = tempDirs.pop();
            if (dir) {
                await rm(dir, { recursive: true, force: true });
            }
        }
    });

    beforeAll(async () => {
        await assertBashSyntax("agent-install.sh");
        await assertBashSyntax("install.sh");
    });

    it("prints help without requiring root", async () => {
        const result = await runBootstrapScript("agent-install.sh", ["--help"]);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("--setup-key");
        expect(result.stdout).toContain("--dry-run");
    });

    it("fails when required flags are missing", async () => {
        const result = await runBootstrapScript("agent-install.sh", ["--host", "https://cp.example.com"]);

        expect(result.exitCode).toBe(1);
        expect(result.stderr + result.stdout).toContain("--host and --setup-key are required");
    });

    it("writes agent.json during dry-run when NetBird URL is provided", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "platform-agent-config-"));
        tempDirs.push(tempDir);
        const configPath = path.join(tempDir, "agent.json");

        const result = await runBootstrapScript("agent-install.sh", [
            "--dry-run",
            "--host",
            "https://cp.example.com/",
            "--setup-key",
            "setup-key-valid",
            "--netbird-management-url",
            "https://vpn.example.com/api/",
            "--config-path",
            configPath,
            "--agent-port",
            "9471"
        ]);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("dry-run complete");

        const config = JSON.parse(await readFile(configPath, "utf8")) as Record<string, unknown>;
        expect(config.cpUrl).toBe("https://cp.example.com");
        expect(config.netbirdManagementUrl).toBe("https://vpn.example.com/api/");
        expect(config.netbirdSetupKey).toBe("setup-key-valid");
        expect(config.agentPort).toBe(9471);
    });

    it("fetches bootstrap settings from the control plane during dry-run", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "platform-agent-config-"));
        tempDirs.push(tempDir);
        const configPath = path.join(tempDir, "agent.json");

        const server = await startMockControlPlane("setup-key-remote");

        try {
            const address = server.address();
            if (!address || typeof address === "string") {
                throw new Error("mock control plane did not bind a port");
            }

            const cpUrl = `http://127.0.0.1:${address.port}`;
            const result = await runBootstrapScript("agent-install.sh", [
                "--dry-run",
                "--host",
                cpUrl,
                "--setup-key",
                "setup-key-remote",
                "--config-path",
                configPath
            ]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain("fetching bootstrap settings");

            const config = JSON.parse(await readFile(configPath, "utf8")) as Record<string, unknown>;
            expect(config.cpUrl).toBe(cpUrl);
            expect(config.netbirdManagementUrl).toBe("https://vpn.example.com");
        } finally {
            await closeServer(server);
        }
    });

    it("keeps install.sh as an alias for agent-install.sh", async () => {
        const shim = await readTextFile(paths.installShim);
        expect(shim).toContain("agent-install.sh");
    });
});

/**
 * Starts a mock control plane HTTP server for bootstrap agent tests.
 *
 * @param setupKey Valid setup key accepted by the mock
 * @returns Listening HTTP server
 */
function startMockControlPlane(setupKey: string): Promise<Server> {
    return new Promise((resolve, reject) => {
        const server = createServer((request, response) => {
            if (request.url === "/bootstrap/agent" && request.headers["x-platform-setup-key"] === setupKey) {
                response.writeHead(200, { "content-type": "application/json" });
                response.end(JSON.stringify({
                    cpUrl: "https://cp.example.com",
                    netbirdManagementUrl: "https://vpn.example.com"
                }));
                return;
            }

            response.writeHead(403, { "content-type": "application/json" });
            response.end(JSON.stringify({ message: "Invalid setup key." }));
        });

        server.listen(0, "127.0.0.1", () => {
            resolve(server);
        });
        server.on("error", reject);
    });
}

/**
 * Closes an HTTP server opened by tests.
 *
 * @param server Server instance to close
 * @returns Nothing.
 */
function closeServer(server: Server): Promise<void> {
    return new Promise((resolve, reject) => {
        server.close((err) => {
            if (err) {
                reject(err);
                return;
            }

            resolve();
        });
    });
}
