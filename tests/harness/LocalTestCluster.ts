import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Manages the local Docker-based multi-node test cluster.
 */
export class LocalTestCluster {
    private static readonly composeFile = path.resolve(
        process.cwd(),
        "tests/fixtures/docker-compose.test-cluster.yml"
    );

    private static readonly projectName = "platform-test-cluster";

    /**
     * Starts the docker compose test cluster.
     * 
     * @returns Nothing.
     */
    static async start(): Promise<void> {
        await execFileAsync(
            "docker",
            [
                "compose",
                "-f",
                this.composeFile,
                "-p",
                this.projectName,
                "up",
                "-d",
                "--build"
            ],
            { cwd: process.cwd() }
        );
    }

    /**
     * Stops and removes the docker compose test cluster.
     * 
     * @returns Nothing.
     */
    static async stop(): Promise<void> {
        await execFileAsync(
            "docker",
            [
                "compose",
                "-f",
                this.composeFile,
                "-p",
                this.projectName,
                "down",
                "-v"
            ],
            { cwd: process.cwd() }
        );
    }

    /**
     * Restarts the docker compose test cluster.
     * 
     * @returns Nothing.
     */
    static async reset(): Promise<void> {
        await this.stop();
        await this.start();
    }

    /**
     * Waits until the primary control plane responds on `/health`.
     * 
     * @param timeoutMs Maximum wait time in milliseconds
     * @returns Nothing.
     */
    static async waitHealthy(timeoutMs = 120_000): Promise<void> {
        const url = this.getControlPlaneUrl();
        const startedAt = Date.now();

        while (Date.now() - startedAt < timeoutMs) {
            try {
                const response = await fetch(`${url}/health`);
                if (response.ok) {
                    return;
                }
            } catch {
                // Retry until timeout.
            }

            await new Promise((resolve) => {
                setTimeout(resolve, 2_000);
            });
        }

        throw new Error(`Control plane did not become healthy at ${url}`);
    }

    /**
     * Returns whether Docker appears to be available on the host.
     * 
     * @returns `true` when `docker version` succeeds
     */
    static async isDockerAvailable(): Promise<boolean> {
        try {
            await execFileAsync("docker", ["version"]);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Returns the primary control plane base URL.
     * 
     * @returns Control plane URL
     */
    static getControlPlaneUrl(): string {
        return process.env.PLATFORM_CP_URL ?? "http://localhost:18080";
    }

    /**
     * Returns the agent base URL for a simulated node id.
     * 
     * @param nodeId Simulated node identifier
     * @returns Agent URL
     */
    static getAgentUrl(nodeId: string): string {
        const ports: Record<string, string> = {
            "node-a": "http://localhost:19001",
            "node-b": "http://localhost:19002",
            builder: "http://localhost:19003"
        };

        return ports[nodeId] ?? "http://localhost:19000";
    }
}
