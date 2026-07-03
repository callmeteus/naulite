import type {
    BuildResult,
    ExecutionOperation,
    Manifest,
    ManifestService,
    Node
} from "@platform/shared";

import type { ControlPlaneContext } from "../ControlPlaneContext";

import { BuildContextService } from "./BuildContextService";
import { AgentProxyError, AgentProxyService } from "./AgentProxyService";

/**
 * Resolved build configuration for a manifest service.
 */
export interface ServiceBuildConfig {
    serviceName: string;
    buildRef: string;
    contextPath: string;
    dockerfile?: string;
    provider: "docker" | "kaniko";
    tags: string[];
}

/**
 * Orchestrates remote image builds on builder-capable agents.
 */
export namespace BuildService {
    /**
     * Resolves the cluster node that should execute image builds.
     *
     * @param nodes Registered cluster nodes
     * @returns Builder node when one exposes an agent URL
     */
    export function resolveBuilderNode(nodes: Node[]): Node | undefined {
        return nodes.find((node) => node.capabilities.includes("builder") && node.agentUrl);
    }

    /**
     * Builds the image reference placeholder for a manifest service.
     *
     * @param service Manifest service definition
     * @returns Build reference or null when the service uses a static image
     */
    export function buildRefForService(service: ManifestService): string | null {
        if (service.image) {
            return null;
        }

        if (typeof service.build === "string") {
            return `build://${service.build}`;
        }

        if (service.build && typeof service.build === "object") {
            return `build://${service.build.context}`;
        }

        return null;
    }

    /**
     * Resolves build configuration for a manifest service.
     *
     * @param manifestName Manifest name
     * @param serviceName Service name inside the manifest
     * @param service Manifest service definition
     * @returns Build configuration when the service declares a build block
     */
    export function resolveServiceBuildConfig(
        manifestName: string,
        serviceName: string,
        service: ManifestService
    ): ServiceBuildConfig | null {
        const buildRef = buildRefForService(service);

        if (!buildRef) {
            return null;
        }

        const contextPath = typeof service.build === "string"
            ? service.build
            : service.build?.context ?? serviceName;
        const dockerfile = typeof service.build === "object" ? service.build.dockerfile : undefined;
        const provider = service.buildOptions?.provider ?? "docker";
        const imageRef = `platform/${manifestName}-${serviceName}:latest`;

        return {
            serviceName,
            buildRef,
            contextPath,
            dockerfile,
            provider,
            tags: [imageRef]
        };
    }

    /**
     * Dispatches a build task to a builder agent.
     *
     * @param context Control plane context with builder providers
     * @param nodes Registered cluster nodes
     * @param serviceName Service name to build
     * @param manifest Parsed manifest containing the service
     * @param options Optional provider and registry overrides
     * @returns Build result metadata from the agent or provider
     */
    export async function buildService(
        _context: ControlPlaneContext,
        nodes: Node[],
        serviceName: string,
        manifest: Manifest,
        options: {
            provider?: string;
            registry?: string;
            buildContextRoot?: string;
        } = {}
    ): Promise<BuildResult> {
        const manifestService = manifest.services[serviceName];

        if (!manifestService) {
            throw new BuildServiceError(
                "SERVICE_NOT_FOUND",
                `Service ${serviceName} not found in manifest ${manifest.name}.`,
                404
            );
        }

        const buildConfig = resolveServiceBuildConfig(manifest.name, serviceName, manifestService);

        if (!buildConfig) {
            throw new BuildServiceError(
                "BUILD_NOT_CONFIGURED",
                `Service ${serviceName} does not declare a build block.`,
                422
            );
        }

        const providerId = options.provider ?? buildConfig.provider;

        if (providerId === "kaniko") {
            throw new BuildServiceError(
                "BUILDER_NOT_SUPPORTED",
                "Kaniko builds are not supported in this release. Use provider: docker on a builder-capable agent.",
                422
            );
        }

        const builderNode = resolveBuilderNode(nodes);

        if (!builderNode?.agentUrl) {
            throw new BuildServiceError(
                "BUILDER_NOT_CONFIGURED",
                "No builder-capable node is available in the cluster.",
                503
            );
        }

        const startedAt = Date.now();
        const taskId = `${manifest.name}-${serviceName}-${startedAt}`;
        let agentContextPath = `/var/lib/platform/builds/${serviceName}`;
        const contextRoot = options.buildContextRoot?.trim();

        if (contextRoot) {
            const relativePath = typeof manifestService.build === "string"
                ? manifestService.build
                : manifestService.build?.context ?? ".";
            agentContextPath = await BuildContextService.syncToAgent({
                serviceName,
                contextRoot,
                relativeContextPath: relativePath,
                agentUrl: builderNode.agentUrl
            });
        }

        try {
            const response = await AgentProxyService.postTask(builderNode.agentUrl, "/tasks/build", {
                taskId,
                serviceName,
                contextPath: agentContextPath,
                dockerfile: buildConfig.dockerfile,
                tags: buildConfig.tags,
                provider: providerId,
                registry: options.registry
            }) as {
                taskId?: string;
                status?: string;
                imageRef?: string;
                logs?: string;
                error?: string;
            };

            if (response.status === "failed") {
                throw new BuildServiceError(
                    "BUILD_FAILED",
                    response.error ?? `Build for ${serviceName} failed on the agent.`,
                    502
                );
            }

            return {
                imageRef: response.imageRef ?? buildConfig.tags[0] ?? `platform/${serviceName}:latest`,
                logs: response.logs ? [response.logs] : [`[build] completed taskId=${response.taskId ?? taskId}`],
                durationMs: Date.now() - startedAt
            };
        } catch (err) {
            if (err instanceof AgentProxyError) {
                throw new BuildServiceError(err.code, err.message, err.statusCode);
            }

            if (err instanceof BuildServiceError) {
                throw err;
            }

            throw new BuildServiceError(
                "BUILDER_NOT_CONFIGURED",
                err instanceof Error ? err.message : String(err),
                503
            );
        }
    }

    /**
     * Replaces build placeholders in execution operations with built image references.
     *
     * @param context Control plane context with builder providers
     * @param manifest Parsed manifest being applied
     * @param operations Planner operations before dispatch
     * @param nodes Registered cluster nodes
     * @returns Operations with build references resolved to concrete image tags
     */
    export async function resolveBuildOperations(
        context: ControlPlaneContext,
        manifest: Manifest,
        operations: ExecutionOperation[],
        nodes: Node[],
        options: {
            buildContextRoot?: string;
        } = {}
    ): Promise<ExecutionOperation[]> {
        const buildRefs = new Map<string, string>();

        for (const operation of operations) {
            if (operation.type !== "create") {
                continue;
            }

            if (!operation.image.startsWith("build://")) {
                continue;
            }

            if (buildRefs.has(operation.image)) {
                continue;
            }

            const serviceName = operation.serviceName;
            const result = await buildService(context, nodes, serviceName, manifest, {
                buildContextRoot: options.buildContextRoot
            });
            buildRefs.set(operation.image, result.imageRef);
        }

        if (buildRefs.size === 0) {
            return operations;
        }

        return operations.map((operation) => {
            if (operation.type !== "create") {
                return operation;
            }

            const resolved = buildRefs.get(operation.image);

            if (!resolved) {
                return operation;
            }

            return {
                ...operation,
                image: resolved
            };
        });
    }
}

/**
 * Typed error for build orchestration failures.
 */
export class BuildServiceError extends Error {
    /**
     * Creates a build service error.
     *
     * @param code Stable error code
     * @param message Human-readable message
     * @param statusCode HTTP status to return
     */
    constructor(
        public readonly code: string,
        message: string,
        public readonly statusCode: number
    ) {
        super(message);
    }
}
