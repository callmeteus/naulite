import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { AgentProxyService } from "./AgentProxyService";

const execFileAsync = promisify(execFile);

/**
 * Options for syncing a build context directory to an agent.
 */
export interface BuildContextSyncOptions {
    serviceName: string;
    contextRoot: string;
    relativeContextPath?: string;
    agentUrl: string;
}

/**
 * Syncs Docker build contexts from the control plane filesystem to builder agents.
 */
export namespace BuildContextService {
    /**
     * Resolves the absolute local path for a manifest build context.
     *
     * @param contextRoot Repository or fixture root directory on the control plane
     * @param relativeContextPath Relative context path from the manifest build block
     * @returns Absolute path to the build context directory
     */
    export async function resolveLocalContextPath(
        contextRoot: string,
        relativeContextPath: string
    ): Promise<string> {
        const normalizedRoot = path.resolve(contextRoot);
        const resolved = path.resolve(normalizedRoot, relativeContextPath);

        if (!resolved.startsWith(normalizedRoot)) {
            throw new Error("Build context path escapes the configured context root.");
        }

        await access(resolved);
        return resolved;
    }

    /**
     * Creates a gzip tarball for a build context directory.
     *
     * @param contextDir Absolute path to the build context directory
     * @returns Gzip tarball bytes
     */
    export async function createContextArchive(contextDir: string): Promise<Buffer> {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), "naulite-build-context-"));
        const archivePath = path.join(tempDir, "context.tar.gz");

        try {
            await execFileAsync("tar", ["-czf", archivePath, "-C", contextDir, "."], {
                windowsHide: true
            });
            return await readFile(archivePath);
        } finally {
            await rm(tempDir, { recursive: true, force: true });
        }
    }

    /**
     * Uploads a build context archive to a builder agent.
     *
     * @param options Build context sync options
     * @returns Agent-side context path ready for docker build
     */
    export async function syncToAgent(options: BuildContextSyncOptions): Promise<string> {
        const relativePath = options.relativeContextPath ?? ".";
        const localContextPath = await resolveLocalContextPath(options.contextRoot, relativePath);
        const archive = await createContextArchive(localContextPath);
        const archiveBase64 = archive.toString("base64");

        console.debug(
            "[build-context] sync service=%s root=%s bytes=%d agent=%s",
            options.serviceName,
            localContextPath,
            archive.byteLength,
            options.agentUrl
        );

        const response = await AgentProxyService.postTask(options.agentUrl, "/tasks/build-context", {
            serviceName: options.serviceName,
            archiveBase64
        }) as {
            contextPath?: string;
            status?: string;
        };

        if (response.status !== "ready" || !response.contextPath) {
            throw new Error(`Agent failed to prepare build context for ${options.serviceName}.`);
        }

        return response.contextPath;
    }
}
