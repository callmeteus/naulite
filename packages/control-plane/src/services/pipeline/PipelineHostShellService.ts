import { spawn } from "node:child_process";

/**
 * Runs pipeline shell steps on the control plane host (no sandbox).
 */
export namespace PipelineHostShellService {
    /**
     * Executes a shell command string on the control plane host.
     *
     * @param command Full shell command (passed to bash -lc)
     * @param options Working directory and extra environment variables
     * @returns Captured stdout and stderr
     */
    export async function runShellCommand(
        command: string,
        options: {
            cwd?: string;
            env?: Record<string, string>;
        } = {}
    ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
        return new Promise((resolve, reject) => {
            const child = spawn("bash", ["-lc", command], {
                cwd: options.cwd,
                env: {
                    ...process.env,
                    ...options.env
                },
                stdio: ["ignore", "pipe", "pipe"]
            });

            let stdout = "";
            let stderr = "";

            child.stdout.on("data", (chunk: Buffer) => {
                stdout += chunk.toString("utf8");
            });

            child.stderr.on("data", (chunk: Buffer) => {
                stderr += chunk.toString("utf8");
            });

            child.on("error", (err) => {
                reject(err);
            });

            child.on("close", (code) => {
                resolve({
                    stdout,
                    stderr,
                    exitCode: code ?? 1
                });
            });
        });
    }
}
