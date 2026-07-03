import type {
    BuildResult,
    BuilderProvider,
    DockerBuildOptions,
    KanikoBuildOptions
} from "@platform/shared";

/**
 * Kaniko builder provider with stubbed build execution.
 */
export class KanikoBuilderProvider implements BuilderProvider {
    /**
     * Builds an image using the Docker engine on a builder node.
     *
     * @param options Docker build options
     * @returns Build result metadata
     */
    async buildWithDocker(options: DockerBuildOptions): Promise<BuildResult> {
        void options;
        throw new Error("Docker engine builds are not supported by @platform/builder-kaniko");
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
            "[builders/kaniko] buildWithKaniko contextUri=%s destination=%s dockerfile=%s",
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
 * Creates a Kaniko builder provider.
 *
 * @returns Configured builder provider
 */
export function createKanikoBuilderProvider(): KanikoBuilderProvider {
    return new KanikoBuilderProvider();
}
