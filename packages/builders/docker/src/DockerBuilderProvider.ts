import type {
    BuildResult,
    DockerBuildOptions,
    KanikoBuildOptions
} from "@platform/shared";
import { BuilderProvider } from "@platform/control-plane";

/**
 * Docker builder provider with stubbed build execution.
 */
export class DockerBuilderProvider extends BuilderProvider {
    /**
     * Builds an image using the Docker engine on a builder node.
     *
     * @param options Docker build options
     * @returns Build result metadata
     */
    async buildWithDocker(options: DockerBuildOptions): Promise<BuildResult> {
        const startedAt = Date.now();
        const imageRef = options.tags[0] ?? "local/build:latest";
        console.debug(
            "[builders/docker] buildWithDocker contextPath=%s dockerfile=%s tags=%o",
            options.contextPath,
            options.dockerfile ?? "Dockerfile",
            options.tags
        );

        return {
            imageRef,
            logs: [
                `[docker] building ${imageRef} from ${options.contextPath}`,
                `[docker] stub build completed`
            ],
            durationMs: Date.now() - startedAt
        };
    }

    /**
     * Builds an image using Kaniko in an isolated build context.
     *
     * @param options Kaniko build options
     * @returns Build result metadata
     */
    async buildWithKaniko(_options: KanikoBuildOptions): Promise<BuildResult> {
        throw new Error("Kaniko builds are not supported by @platform/builder-docker");
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
