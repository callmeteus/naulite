import type { ClusterPlacement } from "../types/ClusterLabels.js";
import type { ResolvedSecret } from "../types/Common.js";

/**
 * Options for a local Docker build on a builder-capable node.
 */
export interface DockerBuildOptions {
    contextPath: string;
    dockerfile?: string;
    tags: string[];
    buildArgs?: Record<string, string>;
    secrets?: ResolvedSecret[];
    cluster?: ClusterPlacement;
}

/**
 * Options for a remote Kaniko build.
 */
export interface KanikoBuildOptions {
    contextUri: string;
    dockerfile?: string;
    destination: string;
    registryCredentials?: ResolvedSecret;
    cluster?: ClusterPlacement;
}

/**
 * Result metadata for a completed image build.
 */
export interface BuildResult {
    imageRef: string;
    logs: string[];
    durationMs: number;
}

/**
 * Builder provider contract for Docker and Kaniko implementations.
 */
export interface BuilderProvider {
    /**
     * Builds an image using the Docker engine on a builder node.
     * 
     * @param options Docker build options
     * @returns Build result metadata
     */
    buildWithDocker(options: DockerBuildOptions): Promise<BuildResult>;

    /**
     * Builds an image using Kaniko in an isolated build context.
     * 
     * @param options Kaniko build options
     * @returns Build result metadata
     */
    buildWithKaniko(options: KanikoBuildOptions): Promise<BuildResult>;
}
