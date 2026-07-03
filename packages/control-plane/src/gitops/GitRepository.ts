import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Options for cloning and checking out a git repository.
 */
export interface GitCloneCheckoutOptions {
    repositoryUrl: string;
    branch: string;
    commitSha?: string;
    workDir: string;
}

/**
 * Result of a git clone and checkout operation.
 */
export interface GitCloneCheckoutResult {
    commitSha: string;
}

/**
 * Executes git CLI commands.
 */
export interface GitRunner {
    /**
     * Runs a git command.
     *
     * @param args Git CLI arguments
     * @param options Optional working directory
     * @returns Captured stdout and stderr
     */
    exec(args: string[], options?: { cwd?: string }): Promise<{ stdout: string; stderr: string }>;
}

/**
 * Git clone and checkout helpers for GitOps.
 */
export namespace GitRepository {
    let runner: GitRunner = createDefaultRunner();

    /**
     * Configures the git runner used for clone and checkout operations.
     *
     * @param options Runner configuration
     * @returns Nothing.
     */
    export function configure(options: { runner?: GitRunner }): void {
        if (options.runner) {
            runner = options.runner;
        }
    }

    /**
     * Restores the default process-spawn git runner.
     *
     * @returns Nothing.
     */
    export function resetRunner(): void {
        runner = createDefaultRunner();
    }

    /**
     * Clones a repository and optionally checks out a specific commit.
     *
     * @param options Clone and checkout options
     * @returns Resolved HEAD commit SHA
     */
    export async function cloneCheckout(options: GitCloneCheckoutOptions): Promise<GitCloneCheckoutResult> {
        const { repositoryUrl, branch, commitSha, workDir } = options;

        console.debug(
            "[gitops] clone repositoryUrl=%s branch=%s commitSha=%s workDir=%s",
            repositoryUrl,
            branch,
            commitSha ?? "-",
            workDir
        );

        if (commitSha) {
            await runner.exec(["clone", repositoryUrl, workDir]);
            await runner.exec(["checkout", commitSha], { cwd: workDir });
        } else {
            await runner.exec([
                "clone",
                "--branch",
                branch,
                "--single-branch",
                "--depth",
                "1",
                repositoryUrl,
                workDir
            ]);
        }

        const { stdout } = await runner.exec(["rev-parse", "HEAD"], { cwd: workDir });
        const resolvedSha = stdout.trim();

        console.debug("[gitops] checkout resolved commitSha=%s", resolvedSha);

        return { commitSha: resolvedSha };
    }

    /**
     * Creates the default git runner that shells out to the git CLI.
     *
     * @returns Default git runner
     */
    function createDefaultRunner(): GitRunner {
        return {
            async exec(args, options) {
                const result = await execFileAsync("git", args, {
                    cwd: options?.cwd,
                    maxBuffer: 10 * 1024 * 1024,
                    env: {
                        ...process.env,
                        GIT_TERMINAL_PROMPT: "0"
                    }
                });

                return {
                    stdout: result.stdout.toString(),
                    stderr: result.stderr.toString()
                };
            }
        };
    }
}
