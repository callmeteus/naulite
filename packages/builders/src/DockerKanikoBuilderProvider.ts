import type {
    BuildResult,
    BuilderProvider,
    DockerBuildOptions,
    KanikoBuildOptions
} from "@platform/shared";

/**
 * Docker and Kaniko builder provider with stubbed build execution.
 */
export class DockerKanikoBuilderProvider implements BuilderProvider {
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
            "[builders] buildWithDocker contextPath=%s dockerfile=%s tags=%o",
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
    async buildWithKaniko(options: KanikoBuildOptions): Promise<BuildResult> {
        const startedAt = Date.now();
        console.debug(
            "[builders] buildWithKaniko contextUri=%s destination=%s dockerfile=%s",
            options.contextUri,
            options.destination,
            options.dockerfile ?? "Dockerfile"
        );

        return {
            imageRef: options.destination,
            logs: [
                `[kaniko] building ${options.destination} from ${options.contextUri}`,
                `[kaniko] stub build completed`
            ],
            durationMs: Date.now() - startedAt
        };
    }
}

/**
 * Creates a Docker and Kaniko builder provider.
 * 
 * @returns Configured builder provider
 */
export function createDockerKanikoBuilderProvider(): DockerKanikoBuilderProvider {
    return new DockerKanikoBuilderProvider();
}
