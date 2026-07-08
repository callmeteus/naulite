import { execFile } from "node:child_process";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { Logger } from "../Logger";
import type { SecretsService } from "../services/SecretsService";

const execFileAsync = promisify(execFile);
const log_gitops = Logger.create("gitops");

export namespace GitSourceRepository {
    /**
     * Minimal git credentials used by the resolver.
     *
     * v1 supports `from: "secret"` only.
     */
    export type GitCredentials = {
        from: "secret";
        secret: string;
        key?: string;
        kind?: "ssh" | "https";
    };

    export interface ResolveOptions {
        /**
         * The specification of the source repository.
         */
        spec: string;

        /**
         * The credentials to use for the source repository.
         */
        credentials?: GitCredentials;

        /**
         * Base directory for local paths.
         */
        baseDir?: string;
    }

    export interface ResolvedSource {
        /**
         * Directory containing the checked-out repository (git) or the directory for local paths.
         */
        workDir: string;

        /**
         * Absolute path to the compose YAML file.
         */
        composePath: string;

        /**
         * File content.
         */
        yaml: string;

        /**
         * Resolved commit SHA for git sources, when available.
         */
        commitSha?: string;

        /**
         * Normalized source identifier for caching/auditing.
         */
        sourceId: string;
    }

    export interface RepositoryCache {
        /**
         * Gets a cached resolved source by key.
         * @param key The key to get the cached resolved source from.
         * @returns The cached resolved source or undefined if not found.
         */
        get(key: string): ResolvedSource | undefined;

        /**
         * Sets a cached resolved source by key.
         * @param key The key to set the cached resolved source to.
         * @param value The cached resolved source to set.
         */
        set(key: string, value: ResolvedSource): void;
    }

    /**
     * Creates an in-memory cache for resolved sources.
     * @returns The in-memory cache.
     */
    export function createInMemoryCache(): RepositoryCache {
        const cache = new Map<string, ResolvedSource>();
        return {
            get(key) {
                return cache.get(key);
            },
            set(key, value) {
                cache.set(key, value);
            }
        };
    }

    /**
     * Resolves the compose file from the source repository.
     * @param secrets The secrets service.
     * @param options The options for the resolution.
     * @param cache The cache to use for the resolution.
     * @returns The resolved source.
     */
    export async function resolveComposeFile(
        secrets: SecretsService,
        options: ResolveOptions,
        cache?: RepositoryCache
    ): Promise<ResolvedSource> {
        const parsed = parseSpec(options.spec);

        if (parsed.kind === "local") {
            const base = options.baseDir ?? process.cwd();
            const composePath = path.isAbsolute(parsed.path)
                ? parsed.path
                : path.resolve(base, parsed.path);
            const yaml = await import("node:fs/promises").then((fs) => fs.readFile(composePath, "utf8"));
            return {
                workDir: path.dirname(composePath),
                composePath,
                yaml,
                sourceId: `local:${composePath}`
            };
        }

        const cacheKey = `${parsed.cloneUrl}#${parsed.ref ?? ""}/${parsed.filePath ?? ""}`;
        const cached = cache?.get(cacheKey);
        if (cached) {
            return cached;
        }

        const workDir = await mkdtemp(path.join(tmpdir(), "naulite-git-src-"));
        const env = await buildGitEnv(secrets, options.credentials, workDir);

        log_gitops.debug("[gitops] git source clone url=%s ref=%s file=%s", parsed.cloneUrl, parsed.ref ?? "-", parsed.filePath ?? "-");

        const cloneUrl = rewriteHttpsUrlWithToken(parsed.cloneUrl, env);

        if (parsed.ref) {
            await execGit(["clone", "--branch", parsed.ref, "--single-branch", "--depth", "1", cloneUrl, workDir], { env });
        } else {
            await execGit(["clone", "--depth", "1", cloneUrl, workDir], { env });
        }

        const commitSha = (await execGit(["rev-parse", "HEAD"], { cwd: workDir, env })).stdout.trim();
        const composeRel = parsed.filePath ?? "compose.yaml";
        const composePath = path.resolve(workDir, composeRel);
        const yaml = await import("node:fs/promises").then((fs) => fs.readFile(composePath, "utf8"));

        const resolved: ResolvedSource = {
            workDir,
            composePath,
            yaml,
            commitSha,
            sourceId: `git:${parsed.cloneUrl}#${parsed.ref ?? commitSha}/${composeRel}`
        };

        cache?.set(cacheKey, resolved);
        return resolved;
    }

    interface LocalSpec {
        kind: "local";
        path: string;
    }

    interface GitSpec {
        kind: "git";
        cloneUrl: string;
        ref?: string;
        filePath?: string;
    }

    export function parseSpec(spec: string): LocalSpec | GitSpec {
        /**
         * Supported formats (platform resolver):
         * - local paths: `./compose.yaml`, `../compose.yaml`, absolute paths
         * - github shorthand: `github:owner/repo#ref[/path/to/compose.yaml]`
         * - generic host shorthand: `git:host/owner/repo#ref[/path]`
         * - explicit URLs: `git+https://...#ref`, `git+ssh://...#ref`
         */
        const trimmed = spec.trim();

        if (
            trimmed.startsWith("./")
            || trimmed.startsWith("../")
            || trimmed.startsWith("/")
            || /^[a-zA-Z]:[\\/]/.test(trimmed)
        ) {
            return { kind: "local", path: trimmed };
        }

        const [repoPart, hashPart] = trimmed.split("#", 2);
        const { cloneUrl, defaultFilePath } = normalizeRepoPart(repoPart);

        if (!hashPart) {
            return { kind: "git", cloneUrl, filePath: defaultFilePath };
        }

        const slashIndex = hashPart.indexOf("/");
        if (slashIndex === -1) {
            return { kind: "git", cloneUrl, ref: hashPart, filePath: defaultFilePath };
        }

        const ref = hashPart.slice(0, slashIndex);
        const filePath = hashPart.slice(slashIndex + 1);
        return { kind: "git", cloneUrl, ref, filePath: filePath || defaultFilePath };
    }

    function normalizeRepoPart(repoPart: string): { cloneUrl: string; defaultFilePath: string } {
        if (repoPart.startsWith("github:")) {
            const rest = repoPart.slice("github:".length);
            return {
                cloneUrl: `https://github.com/${rest}.git`,
                defaultFilePath: "compose.yaml"
            };
        }

        if (repoPart.startsWith("git:")) {
            const rest = repoPart.slice("git:".length);
            return {
                cloneUrl: `https://${rest}.git`,
                defaultFilePath: "compose.yaml"
            };
        }

        if (repoPart.startsWith("git+https://")) {
            return {
                cloneUrl: repoPart.slice("git+".length),
                defaultFilePath: "compose.yaml"
            };
        }

        if (repoPart.startsWith("git+ssh://")) {
            return {
                cloneUrl: repoPart.slice("git+".length),
                defaultFilePath: "compose.yaml"
            };
        }

        return {
            cloneUrl: repoPart,
            defaultFilePath: "compose.yaml"
        };
    }

    /**
     * Builds the environment variables for the git command.
     * @param secrets The secrets service.
     * @param credentials The credentials to use for the git command.
     * @param workDir The working directory for the git command.
     * @returns The environment variables for the git command.
     */
    async function buildGitEnv(
        secrets: SecretsService,
        credentials: GitCredentials | undefined,
        workDir: string
    ): Promise<NodeJS.ProcessEnv> {
        const baseEnv: NodeJS.ProcessEnv = {
            ...process.env,
            GIT_TERMINAL_PROMPT: "0"
        };

        if (!credentials) {
            return baseEnv;
        }

        if (credentials.from === "secret") {
            const values = await secrets.resolveValues(credentials.secret);
            if (!values) {
                throw new Error(`Secret de credenciais não encontrado: ${credentials.secret}`);
            }

            const key = credentials.key;
            const explicitKind = credentials.kind;

            const privateKey = key ? values[key] : values.privateKey ?? values.key ?? values.sshKey;
            const token = key ? values[key] : values.token;

            if (explicitKind === "ssh" || (!explicitKind && privateKey?.includes("BEGIN"))) {
                if (!privateKey) {
                    throw new Error(`Secret ${credentials.secret} não contém a chave SSH esperada`);
                }

                const keyPath = path.join(workDir, "git-ssh-key");
                await writeFile(keyPath, privateKey, "utf8");
                await chmod(keyPath, 0o600);

                return {
                    ...baseEnv,
                    GIT_SSH_COMMAND: `ssh -i "${keyPath}" -o StrictHostKeyChecking=no`
                };
            }

            if (explicitKind === "https" || token) {
                if (!token) {
                    throw new Error(`Secret ${credentials.secret} não contém token HTTPS esperado`);
                }

                return {
                    ...baseEnv,
                    NAULITE_GIT_TOKEN: token
                };
            }
        }

        return baseEnv;
    }

    /**
     * Executes the git command.
     * @param args The arguments to pass to the git command.
     * @param options The options for the execution.
     * @returns The result of the execution.
     */
    async function execGit(
        args: string[],
        options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}
    ): Promise<{ stdout: string; stderr: string }> {
        const result = await execFileAsync("git", args, {
            cwd: options.cwd,
            maxBuffer: 10 * 1024 * 1024,
            env: options.env
        });

        return {
            stdout: result.stdout.toString(),
            stderr: result.stderr.toString()
        };
    }

    function rewriteHttpsUrlWithToken(cloneUrl: string, env: NodeJS.ProcessEnv): string {
        const token = env.NAULITE_GIT_TOKEN;
        if (!token || typeof token !== "string" || token.trim() === "") {
            return cloneUrl;
        }

        if (!cloneUrl.startsWith("https://")) {
            return cloneUrl;
        }

        // GitHub supports x-access-token; for other hosts it's commonly accepted as basic auth.
        return `https://x-access-token:${encodeURIComponent(token)}@${cloneUrl.slice("https://".length)}`;
    }
}
