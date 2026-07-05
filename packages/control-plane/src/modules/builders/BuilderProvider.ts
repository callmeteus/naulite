import type {
    BuildResult,
    DockerBuildOptions,
    KanikoBuildOptions
} from "@naulite/shared";

/**
 * Abstract builder provider contract for Docker and Kaniko plugin implementations.
 */
export abstract class BuilderProvider {
    /**
     * Builds an image using the Docker engine on a builder node.
     *
     * @param options Docker build options
     * @returns Build result metadata
     */
    abstract buildWithDocker(options: DockerBuildOptions): Promise<BuildResult>;

    /**
     * Builds an image using Kaniko in an isolated build context.
     *
     * @param options Kaniko build options
     * @returns Build result metadata
     */
    abstract buildWithKaniko(options: KanikoBuildOptions): Promise<BuildResult>;
}
