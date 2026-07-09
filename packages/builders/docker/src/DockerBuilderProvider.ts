import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import type {
    BuildResult,
    BuilderProvider,
    DockerBuildOptions,
    KanikoBuildOptions
} from "@naulite/shared";

const execFileAsync = promisify(execFile);

/**
 * Docker builder provider that runs local Docker CLI builds.
 */
export class DockerBuilderProvider implements BuilderProvider {
    /**
     * Builds an image using the Docker engine on a builder node.
     *
     * @param options Docker build options
     * @returns Build result metadata
     */
    async buildWithDocker(options: DockerBuildOptions): Promise<BuildResult> {
        const startedAt = Date.now();
        const imageRef = options.tags[0] ?? "local/build:latest";
        const dockerfile = options.dockerfile ?? "Dockerfile";
        const dockerfilePath = path.join(options.contextPath, dockerfile);

        console.debug(
            "[builders/docker] buildWithDocker contextPath=%s dockerfile=%s tags=%o",
            options.contextPath,
            dockerfile,
            options.tags
        );

        const args = [
            "build",
            "-t",
            imageRef,
            "-f",
            dockerfilePath,
            options.contextPath
        ];

        for (const [key, value] of Object.entries(options.buildArgs ?? {})) {
            args.push("--build-arg", `${key}=${value}`);
        }

        const { stdout, stderr } = await execFileAsync("docker", args, {
            maxBuffer: 10 * 1024 * 1024
        });

        return {
            imageRef,
            logs: [stdout, stderr].filter((entry) => entry.length > 0),
            durationMs: Date.now() - startedAt
        };
    }

    /**
     * Builds an image using Kaniko in an isolated build context.
     *
     * @param options Kaniko build options
     * @returns Build result metadata
     * @throws {Error} {@link Error}
     */
    async buildWithKaniko(options: KanikoBuildOptions): Promise<BuildResult> {
        void options;
        throw new Error("Kaniko builds are not supported by @naulite/builder-docker");
    }
}

/**
 * Creates a Docker builder provider.
 *
 * @returns Configured builder provider
 */
export function createDockerBuilderProvider(): DockerBuilderProvider {
    return new DockerBuilderProvider();
}
