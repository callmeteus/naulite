import { execFile } from "node:child_process";
import { access, copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const platformRoot = path.resolve(import.meta.dirname, "../../..");
const bootstrapDir = path.join(platformRoot, "bootstrap");

/**
 * Resolves a bash executable when available on the host.
 *
 * @returns Bash path or null when bash is unavailable
 */
export async function resolveBashExecutable(): Promise<string | null> {
    const candidates = process.platform === "win32"
        ? [
            "C:\\Program Files\\Git\\bin\\bash.exe",
            "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
            "bash"
        ]
        : ["bash", "/bin/bash", "/usr/bin/bash"];

    for (const candidate of candidates) {
        try {
            await access(candidate);
            return candidate;
        } catch {
            continue;
        }
    }

    try {
        await execFileAsync("bash", ["--version"]);
        return "bash";
    } catch {
        return null;
    }
}

/**
 * Result of executing a bootstrap shell script.
 */
export interface BootstrapScriptResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}

/**
 * Executes a bootstrap shell script with optional environment overrides.
 *
 * @param scriptName Bootstrap script file name inside `bootstrap/`
 * @param args Script arguments
 * @param env Extra environment variables
 * @returns Process output and exit code
 */
export async function runBootstrapScript(
    scriptName: string,
    args: string[],
    env: Record<string, string> = {}
): Promise<BootstrapScriptResult> {
    const bash = await resolveBashExecutable();

    if (!bash) {
        throw new Error("bash is not available");
    }

    const scriptPath = path.join(bootstrapDir, scriptName);

    try {
        const { stdout, stderr } = await execFileAsync(bash, [scriptPath, ...args], {
            cwd: platformRoot,
            env: {
                ...process.env,
                ...env
            },
            maxBuffer: 10 * 1024 * 1024
        });

        return {
            stdout,
            stderr,
            exitCode: 0
        };
    } catch (err) {
        if (err && typeof err === "object" && "code" in err) {
            const failed = err as {
                code?: number | string;
                stdout?: string;
                stderr?: string;
            };

            return {
                stdout: failed.stdout ?? "",
                stderr: failed.stderr ?? "",
                exitCode: typeof failed.code === "number" ? failed.code : 1
            };
        }

        throw err;
    }
}

/**
 * Checks bash script syntax with `bash -n`.
 *
 * @param scriptName Bootstrap script file name inside `bootstrap/`
 * @returns Nothing.
 */
export async function assertBashSyntax(scriptName: string): Promise<void> {
    const bash = await resolveBashExecutable();

    if (!bash) {
        throw new Error("bash is not available");
    }

    const scriptPath = path.join(bootstrapDir, scriptName);
    await execFileAsync(bash, ["-n", scriptPath], {
        cwd: platformRoot
    });
}

/**
 * Creates an isolated platform root directory for control plane bootstrap tests.
 *
 * @returns Temporary platform root path
 */
export async function createTempPlatformRoot(): Promise<string> {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "platform-bootstrap-"));
    await copyFile(
        path.join(platformRoot, ".env.example"),
        path.join(tempRoot, ".env.example")
    );
    return tempRoot;
}

/**
 * Removes a temporary platform root directory.
 *
 * @param tempRoot Temporary platform root path
 * @returns Nothing.
 */
export async function removeTempPlatformRoot(tempRoot: string): Promise<void> {
    await rm(tempRoot, { recursive: true, force: true });
}

/**
 * Reads a file from the repository or temp root.
 *
 * @param filePath Absolute file path
 * @returns File contents
 */
export async function readTextFile(filePath: string): Promise<string> {
    return readFile(filePath, "utf8");
}

export const paths = {
    platformRoot,
    bootstrapDir,
    agentInstallScript: path.join(bootstrapDir, "agent-install.sh"),
    controlPlaneInstallScript: path.join(bootstrapDir, "control-plane-install.sh"),
    installShim: path.join(bootstrapDir, "install.sh")
};
