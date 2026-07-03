import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

import { GitRepository } from "../../../packages/control-plane/src/gitops/GitRepository";
import { GitOpsService } from "../../../packages/control-plane/src/services/GitOpsService";

const execFileAsync = promisify(execFile);

/**
 * Runs a git command in the given working directory.
 *
 * @param args Git CLI arguments
 * @param cwd Repository directory
 * @returns Nothing.
 */
async function runGit(args: string[], cwd: string): Promise<void> {
    await execFileAsync("git", args, {
        cwd,
        env: {
            ...process.env,
            GIT_TERMINAL_PROMPT: "0"
        }
    });
}

/**
 * Creates a local git repository with the provided files.
 *
 * @param files Relative file paths and contents
 * @returns Absolute repository directory path
 */
async function createLocalGitRepository(files: Record<string, string>): Promise<string> {
    const repoDir = mkdtempSync(join(tmpdir(), "gitops-repo-"));

    for (const [relativePath, content] of Object.entries(files)) {
        const absolutePath = join(repoDir, relativePath);
        mkdirSync(dirname(absolutePath), { recursive: true });
        writeFileSync(absolutePath, content, "utf8");
    }

    await runGit(["init"], repoDir);
    await runGit(["config", "user.email", "gitops@test.local"], repoDir);
    await runGit(["config", "user.name", "GitOps Test"], repoDir);
    await runGit(["add", "."], repoDir);
    await runGit(["commit", "-m", "init"], repoDir);
    await runGit(["branch", "-M", "main"], repoDir);

    return repoDir;
}

/**
 * Checks whether the git CLI is available.
 *
 * @returns Whether git can be executed
 */
async function isGitAvailable(): Promise<boolean> {
    try {
        await execFileAsync("git", ["--version"]);
        return true;
    } catch {
        return false;
    }
}

describe("GitOpsService", () => {
    let gitAvailable = false;
    let workRoot = "";
    const createdPaths: string[] = [];

    beforeAll(async () => {
        gitAvailable = await isGitAvailable();
        workRoot = mkdtempSync(join(tmpdir(), "gitops-work-"));
        createdPaths.push(workRoot);
        GitOpsService.configure({ baseWorkDir: workRoot });
    });

    afterEach(() => {
        GitRepository.resetRunner();
    });

    afterAll(() => {
        for (const createdPath of createdPaths) {
            if (existsSync(createdPath)) {
                rmSync(createdPath, { recursive: true, force: true });
            }
        }
    });

    it("checks out a local repository and returns the base manifest", async (context) => {
        if (!gitAvailable) {
            context.skip();
        }

        const repoDir = await createLocalGitRepository({
            "compose.yaml": [
                "name: checkout-test",
                "services:",
                "  web:",
                "    image: nginx:1.27"
            ].join("\n")
        });
        createdPaths.push(repoDir);

        const result = await GitOpsService.checkoutAndMerge({
            repositoryUrl: repoDir,
            branch: "main"
        });

        const manifest = parseYaml(result.manifestYaml) as {
            name: string;
            services: { web: { image: string } };
        };

        expect(manifest.name).toBe("checkout-test");
        expect(manifest.services.web.image).toBe("nginx:1.27");
        expect(result.commitSha).toMatch(/^[0-9a-f]{40}$/);
    });

    it("merges overlay manifests after checkout", async (context) => {
        if (!gitAvailable) {
            context.skip();
        }

        const repoDir = await createLocalGitRepository({
            "compose.yaml": [
                "name: overlay-test",
                "services:",
                "  backend:",
                "    environment:",
                "      NODE_ENV: production",
                "      DB_HOST: postgres"
            ].join("\n"),
            "overlays/staging.compose.yml": [
                "services:",
                "  backend:",
                "    environment:",
                "      NODE_ENV: staging",
                "      LOG_LEVEL: debug"
            ].join("\n")
        });
        createdPaths.push(repoDir);

        const result = await GitOpsService.checkoutAndMerge({
            repositoryUrl: repoDir,
            branch: "main",
            overlayPaths: ["overlays/staging.compose.yml"]
        });

        const manifest = parseYaml(result.manifestYaml) as {
            services: {
                backend: {
                    environment: Record<string, string>;
                };
            };
        };

        expect(manifest.services.backend.environment).toEqual({
            NODE_ENV: "staging",
            DB_HOST: "postgres",
            LOG_LEVEL: "debug"
        });
    });

    it("uses a mocked git runner to copy fixture files into the work directory", async () => {
        const fixtureDir = mkdtempSync(join(tmpdir(), "gitops-fixture-"));
        createdPaths.push(fixtureDir);

        writeFileSync(join(fixtureDir, "compose.yaml"), [
            "name: mocked-checkout",
            "services:",
            "  api:",
            "    image: api:mock"
        ].join("\n"), "utf8");

        GitRepository.configure({
            runner: {
                async exec(args) {
                    if (args[0] === "clone") {
                        const targetDir = args[args.length - 1] ?? "";
                        cpSync(fixtureDir, targetDir, { recursive: true });
                        return { stdout: "", stderr: "" };
                    }

                    if (args[0] === "rev-parse") {
                        return { stdout: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef\n", stderr: "" };
                    }

                    return { stdout: "", stderr: "" };
                }
            }
        });

        const result = await GitOpsService.checkoutAndMerge({
            repositoryUrl: "https://example.com/repo.git",
            branch: "main"
        });

        const manifest = parseYaml(result.manifestYaml) as {
            name: string;
            services: { api: { image: string } };
        };

        expect(manifest.name).toBe("mocked-checkout");
        expect(manifest.services.api.image).toBe("api:mock");
        expect(result.commitSha).toBe("deadbeefdeadbeefdeadbeefdeadbeefdeadbeef");
    });

    it("throws when the manifest file is missing after checkout", async () => {
        GitRepository.configure({
            runner: {
                async exec(args) {
                    if (args[0] === "clone") {
                        const targetDir = args[args.length - 1] ?? "";
                        mkdirSync(targetDir, { recursive: true });
                        return { stdout: "", stderr: "" };
                    }

                    if (args[0] === "rev-parse") {
                        return { stdout: "abc123\n", stderr: "" };
                    }

                    return { stdout: "", stderr: "" };
                }
            }
        });

        await expect(GitOpsService.checkoutAndMerge({
            repositoryUrl: "https://example.com/repo.git",
            branch: "main",
            manifestPath: "compose.yaml"
        })).rejects.toThrow(/Manifest file compose.yaml was not found/);
    });
});
