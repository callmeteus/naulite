import {
    resolveManifestBuild,
    resolveServiceImageRef,
    type BuildResult,
    type ExecutionOperation,
    type Manifest,
    type ManifestService,
    type Node
} from "@platform/shared";

import type { ControlPlaneContext } from "../ControlPlaneContext";

import { AgentProxyError, AgentProxyService } from "./AgentProxyService";
import { PipelineRunService } from "./PipelineRunService";

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
    runId?: string;
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
        if (service.image || !service.build) {
            return null;
        }

        const build = resolveManifestBuild(service);

        if (!build) {
            return null;
        }

        return `build://${build.context}`;
    }

    /**
     * Resolves build configuration for a manifest service.
     *
     * @param manifestName Manifest name
     * @param serviceName Service name inside the manifest
     * @param service Manifest service definition
     * @param runId Optional pipeline run identifier
     * @returns Build configuration when the service declares a build block
     */
    export function resolveServiceBuildConfig(
        manifestName: string,
        serviceName: string,
        service: ManifestService,
        runId?: string
    ): ServiceBuildConfig | null {
        const build = resolveManifestBuild(service);

        if (!build) {
            return null;
        }

        const buildRef = buildRefForService(service);

        if (!buildRef) {
            return null;
        }

        const imageRef = resolveServiceImageRef(manifestName, serviceName, service);

        return {
            serviceName,
            buildRef,
            contextPath: build.context,
            dockerfile: build.dockerfile,
            provider: build.provider ?? "docker",
            tags: [imageRef],
            runId
        };
    }

    /**
     * Enqueues an asynchronous build and returns immediately.
     *
     * @param context Control plane context with builder providers
     * @param nodes Registered cluster nodes
     * @param serviceName Service name to build
     * @param manifest Parsed manifest containing the service
     * @param options Optional provider and registry overrides
     * @returns Pipeline run identifiers
     */
    export async function enqueueBuild(
        context: ControlPlaneContext,
        nodes: Node[],
        serviceName: string,
        manifest: Manifest,
        options: {
            provider?: string;
            registry?: string;
            commitSha?: string;
            branch?: string;
        } = {}
    ): Promise<{ runId: string; workflowId: string }> {
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

        const builderNode = resolveBuilderNode(nodes);
        const workflowId = PipelineRunService.createWorkflowId(serviceName);
        const run = await PipelineRunService.createRun({
            kind: "ci_build",
            manifestName: manifest.name,
            serviceName,
            imageRef: buildConfig.tags[0],
            commitSha: options.commitSha,
            branch: options.branch,
            workflowId,
            pool: builderNode ? PipelineRunService.resolvePoolFromLabels(builderNode.labels) : undefined,
            nodeId: builderNode?.id,
            nodeHostname: builderNode?.hostname
        });

        await PipelineRunService.emitEvent(run.id, {
            kind: "ci.build.submitted",
            message: `CI build submitted ${serviceName}`,
            pool: run.pool,
            metadata: {
                imageRef: buildConfig.tags[0],
                branch: options.branch
            }
        });

        void executeBuildInBackground(context, nodes, manifest, buildConfig, options, run.id).catch((err) => {
            console.error("[build] background build failed runId=%s err=%O", run.id, err);
        });

        return {
            runId: run.id,
            workflowId: run.workflowId ?? run.id
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
        context: ControlPlaneContext,
        nodes: Node[],
        serviceName: string,
        manifest: Manifest,
        options: {
            provider?: string;
            registry?: string;
            runId?: string;
            commitSha?: string;
            branch?: string;
            wait?: boolean;
        } = {}
    ): Promise<BuildResult & { runId?: string; workflowId?: string }> {
        if (!options.wait) {
            const enqueued = await enqueueBuild(context, nodes, serviceName, manifest, options);
            return {
                imageRef: manifest.services[serviceName]
                    ? resolveServiceImageRef(manifest.name, serviceName, manifest.services[serviceName])
                    : `platform/${serviceName}:latest`,
                logs: [],
                durationMs: 0,
                runId: enqueued.runId,
                workflowId: enqueued.workflowId
            };
        }

        const manifestService = manifest.services[serviceName];

        if (!manifestService) {
            throw new BuildServiceError(
                "SERVICE_NOT_FOUND",
                `Service ${serviceName} not found in manifest ${manifest.name}.`,
                404
            );
        }

        const runId = options.runId ?? PipelineRunService.createWorkflowId(serviceName);
        const builderNode = resolveBuilderNode(nodes);

        if (!options.runId) {
            await PipelineRunService.createRun({
                kind: "ci_build",
                manifestName: manifest.name,
                serviceName,
                imageRef: resolveServiceImageRef(manifest.name, serviceName, manifestService),
                workflowId: runId,
                pool: builderNode ? PipelineRunService.resolvePoolFromLabels(builderNode.labels) : undefined,
                nodeId: builderNode?.id,
                nodeHostname: builderNode?.hostname
            });
        }

        const buildConfig = resolveServiceBuildConfig(manifest.name, serviceName, manifestService, runId);

        if (!buildConfig) {
            throw new BuildServiceError(
                "BUILD_NOT_CONFIGURED",
                `Service ${serviceName} does not declare a build block.`,
                422
            );
        }

        return executeBuildInBackground(context, nodes, manifest, buildConfig, options, runId);
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
        nodes: Node[]
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
            const workflowId = PipelineRunService.createWorkflowId(serviceName);
            const result = await buildService(context, nodes, serviceName, manifest, {
                wait: true,
                runId: workflowId
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

    /**
     * Executes a build on a builder node and updates pipeline events.
     *
     * @param context Control plane context with builder providers
     * @param nodes Registered cluster nodes
     * @param manifest Parsed manifest being built
     * @param buildConfig Resolved build configuration
     * @param options Build options
     * @param runId Pipeline run identifier
     * @returns Build result metadata
     */
    async function executeBuildInBackground(
        context: ControlPlaneContext,
        nodes: Node[],
        _manifest: Manifest,
        buildConfig: ServiceBuildConfig,
        options: {
            provider?: string;
            registry?: string;
        },
        runId: string
    ): Promise<BuildResult> {
        const providerId = options.provider ?? buildConfig.provider;
        const builderNode = resolveBuilderNode(nodes);

        await PipelineRunService.markRunning(runId);

        if (providerId === "kaniko") {
            const provider = context.builderProviders.get("kaniko");

            if (!provider) {
                throw new BuildServiceError(
                    "BUILDER_NOT_CONFIGURED",
                    "Kaniko builder provider is not registered.",
                    503
                );
            }

            const startedAt = Date.now();
            const result = await provider.buildWithKaniko({
                contextUri: buildConfig.contextPath,
                dockerfile: buildConfig.dockerfile,
                destination: buildConfig.tags[0] ?? `platform/${buildConfig.serviceName}:latest`
            });

            await PipelineRunService.completeRun(runId, "succeeded");
            return {
                ...result,
                durationMs: Date.now() - startedAt
            };
        }

        if (!builderNode?.agentUrl) {
            await PipelineRunService.completeRun(runId, "failed", {
                errorMessage: "No builder-capable node is available in the cluster."
            });
            throw new BuildServiceError(
                "BUILDER_NOT_CONFIGURED",
                "No builder-capable node is available in the cluster.",
                503
            );
        }

        const startedAt = Date.now();
        const taskId = runId;

        await PipelineRunService.emitEvent(runId, {
            kind: "image.build.started",
            message: `Image build started ${buildConfig.serviceName}`,
            nodeId: builderNode.id,
            nodeHostname: builderNode.hostname,
            pool: PipelineRunService.resolvePoolFromLabels(builderNode.labels)
        });

        try {
            const response = await AgentProxyService.postTask(builderNode.agentUrl, "/tasks/build", {
                taskId,
                runId,
                serviceName: buildConfig.serviceName,
                contextPath: buildConfig.contextPath,
                dockerfile: buildConfig.dockerfile,
                tags: buildConfig.tags,
                provider: providerId,
                registry: options.registry,
                cpUrl: process.env.PLATFORM_PUBLIC_URL?.replace(/\/+$/, "") ?? "http://localhost:8080"
            }) as {
                taskId?: string;
                status?: string;
                imageRef?: string;
                logs?: string;
                error?: string;
            };

            if (response.status === "failed") {
                await PipelineRunService.completeRun(runId, "failed", {
                    errorMessage: response.error ?? `Build for ${buildConfig.serviceName} failed on the agent.`,
                    failureLog: response.logs
                });
                throw new BuildServiceError(
                    "BUILD_FAILED",
                    response.error ?? `Build for ${buildConfig.serviceName} failed on the agent.`,
                    502
                );
            }

            await PipelineRunService.emitEvent(runId, {
                kind: "image.pushed",
                message: `Image pushed ${buildConfig.serviceName}`,
                pool: PipelineRunService.resolvePoolFromLabels(builderNode.labels)
            });
            await PipelineRunService.completeRun(runId, "succeeded");

            return {
                imageRef: response.imageRef ?? buildConfig.tags[0] ?? `platform/${buildConfig.serviceName}:latest`,
                logs: response.logs ? [response.logs] : [`[build] completed taskId=${response.taskId ?? taskId}`],
                durationMs: Date.now() - startedAt
            };
        } catch (err) {
            if (err instanceof AgentProxyError) {
                await PipelineRunService.completeRun(runId, "failed", { errorMessage: err.message });
                throw new BuildServiceError(err.code, err.message, err.statusCode);
            }

            if (err instanceof BuildServiceError) {
                throw err;
            }

            await PipelineRunService.completeRun(runId, "failed", {
                errorMessage: err instanceof Error ? err.message : String(err)
            });
            throw new BuildServiceError(
                "BUILDER_NOT_CONFIGURED",
                err instanceof Error ? err.message : String(err),
                503
            );
        }
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
