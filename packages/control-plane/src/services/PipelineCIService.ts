import { join } from "node:path";

import type { Manifest, PipelineJob, PipelineJobStep, PipelineStage, Task } from "@naulite/shared";

import type { ControlPlaneContext } from "../ControlPlaneContext";
import { ControlPlaneService } from "../ControlPlaneService";
import { ComposeParser } from "../orchestration/ComposeParser";
import { ApplyService } from "./ApplyService";
import { BuildService } from "./BuildService";
import { PipelineRunService } from "./PipelineRunService";
import { SandboxService } from "./SandboxService";
import { S3ArtifactService } from "./S3ArtifactService";
import { ExpressionEvaluator } from "./pipeline/ExpressionEvaluator";
import { GeneratorItemService, type PipelineGeneratorItem } from "./pipeline/GeneratorItemService";
import { FanoutRoutingService, type FanoutScope } from "./pipeline/FanoutRoutingService";
import { PreviewHostService } from "./pipeline/PreviewHostService";
import { PreviewHostIngressService } from "./pipeline/PreviewHostIngressService";
import { PipelineHostShellService } from "./pipeline/PipelineHostShellService";

/**
 * Execution context for a CI pipeline run.
 */
export interface PipelineCIExecuteInput {
    manifest: Manifest;
    manifestYaml: string;
    workDir: string;
    branch: string;
    commitSha: string;
    repositoryFullName?: string;
    fanoutScope?: FanoutScope | null;
    runId?: string;
    runtimeVars?: Record<string, string>;
}

/**
 * Orchestrates implicit Docker builds and explicit staged CI pipelines.
 */
export namespace PipelineCIService {
    /**
     * Runs the manifest pipeline (explicit stages or implicit docker builds).
     *
     * @param context Control plane context
     * @param input Execution input
     * @returns Pipeline run id
     */
    export async function execute(
        context: ControlPlaneContext,
        input: PipelineCIExecuteInput
    ): Promise<string> {
        const pipeline = input.manifest.pipeline;
        const hasStages = Boolean(pipeline?.stages && pipeline.stages.length > 0);
        const runId = input.runId ?? PipelineRunService.createWorkflowId(input.manifest.name);

        await PipelineRunService.createRun({
            kind: "ci_pipeline",
            manifestName: input.manifest.name,
            commitSha: input.commitSha,
            branch: input.branch,
            workflowId: runId
        });

        await PipelineRunService.markRunning(runId);
        await PipelineRunService.emitEvent(runId, {
            kind: "ci.pipeline.started",
            message: input.manifest.name
        });

        // Lab / operator goal arming: records an explicit execution objective on the run timeline.
        if (process.env.NAULITE_ARM_RUN_GOAL === "1") {
            await PipelineRunService.emitEvent(runId, {
                kind: "goal.armed",
                message: `Pipeline ${input.manifest.name} on ${input.branch} (${input.commitSha})`
            });
        }

        try {
            if (hasStages) {
                await runExplicitStages(context, input, runId);
            } else {
                await runImplicitDockerBuilds(context, input, runId);
            }

            const latestRun = await PipelineRunService.getRun(runId);

            if (latestRun?.status === "failed") {
                throw new Error(latestRun.errorMessage ?? "Pipeline failed.");
            }

            await PipelineRunService.completeRun(runId, "succeeded");
            await PipelineRunService.emitEvent(runId, {
                kind: "ci.pipeline.finished",
                message: "succeeded"
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            await PipelineRunService.completeRun(runId, "failed", {
                errorMessage: message
            });
            throw err;
        }

        return runId;
    }

    /**
     * Applies a nested manifest referenced by @naulite/apply step.
     *
     * @param manifestYaml Parent manifest yaml (unused, kept for tracing)
     * @param applyArgs Parsed apply CLI args
     * @param vars Interpolation vars
     * @param workDir Checkout root
     * @param runId Active pipeline run
     * @returns Nothing.
     */
    export async function runApplyStep(
        _manifestYaml: string,
        applyArgs: string[],
        vars: Record<string, string>,
        workDir: string,
        runId: string,
        options: {
            branch: string;
            commitSha: string;
            repositoryUrl?: string;
        }
    ): Promise<void> {
        const fileFlagIndex = applyArgs.findIndex((arg) => arg === "-f" || arg === "--file");
        const manifestPath = fileFlagIndex >= 0 ? applyArgs[fileFlagIndex + 1] : undefined;

        if (!manifestPath) {
            throw new Error("apply step requires -f <manifest>");
        }

        const resolvedPath = interpolate(manifestPath, vars);
        const absolutePath = join(workDir, resolvedPath);
        const parser = new ComposeParser();
        const nestedYaml = await readFileUtf8(absolutePath);
        parser.parse(nestedYaml);

        const cliVars = parseApplyCliVars(applyArgs, vars);
        const playbookVars = mergeNestedApplyPlaybookVars(vars, cliVars);

        await ApplyService.execute(nestedYaml, {
            repositoryUrl: options.repositoryUrl,
            branch: options.branch,
            commitSha: options.commitSha,
            buildContextRoot: workDir,
            runId,
            playbookVars
        });
    }

    /**
     * Runs explicit pipeline stages sequentially.
     *
     * @param context Control plane context
     * @param input Execution input
     * @param runId Pipeline run id
     * @returns Nothing.
     */
    async function runExplicitStages(
        context: ControlPlaneContext,
        input: PipelineCIExecuteInput,
        runId: string
    ): Promise<void> {
        const stages = input.manifest.pipeline?.stages ?? [];
        const stageStatus: Record<string, string> = {};

        for (const stage of stages) {
            const evalContext = {
                branch: input.branch,
                commitSha: input.commitSha,
                ...flattenStageStatus(stageStatus)
            };

            if (!ExpressionEvaluator.evaluateWhen(stage.when, evalContext)) {
                continue;
            }

            await PipelineRunService.emitEvent(runId, {
                kind: "ci.stage.started",
                message: stage.name
            });

            if (stage.gate === "manual") {
                await PipelineRunService.updateRunFields(runId, {
                    status: "awaiting_approval"
                });
            }

            const jobs = expandStageJobs(stage, input);

            await Promise.all(jobs.map((jobPlan) => {
                return runJob(context, input, runId, jobPlan.job, jobPlan.vars, jobPlan.item);
            }));

            stageStatus[stage.name] = "succeeded";

            await PipelineRunService.emitEvent(runId, {
                kind: "ci.stage.finished",
                message: stage.name
            });
        }
    }

    /**
     * Expands stage jobs including forEach generator items.
     *
     * @param stage Pipeline stage
     * @param input Execution input
     * @returns Job plans with per-item vars
     */
    function expandStageJobs(
        stage: PipelineStage,
        input: PipelineCIExecuteInput
    ): Array<{ job: PipelineJob; vars: Record<string, string>; item?: PipelineGeneratorItem }> {
        const plans: Array<{ job: PipelineJob; vars: Record<string, string>; item?: PipelineGeneratorItem }> = [];
        const baseVars = buildVars(input);

        for (const job of stage.jobs) {
            if (!job.forEach) {
                plans.push({
                    job,
                    vars: baseVars
                });
                continue;
            }

            const generator = GeneratorItemService.findGenerator(
                input.manifest.pipeline?.generators ?? [],
                job.forEach.generator
            );

            if (!generator) {
                continue;
            }

            let items = GeneratorItemService.expandGenerator(generator, baseVars);

            if (input.fanoutScope) {
                items = FanoutRoutingService.filterItems(items, input.fanoutScope);
            }

            for (const item of items) {
                plans.push({
                    job,
                    vars: {
                        ...baseVars,
                        "item.name": item.name,
                        "item.path": item.path
                    },
                    item
                });
            }
        }

        return plans;
    }

    /**
     * Runs one job (steps + artifacts).
     *
     * @param context Control plane context
     * @param input Execution input
     * @param runId Pipeline run id
     * @param job Job definition
     * @param vars Interpolation vars
     * @param item Optional generator item
     * @returns Nothing.
     */
    async function runJob(
        context: ControlPlaneContext,
        input: PipelineCIExecuteInput,
        runId: string,
        job: PipelineJob,
        vars: Record<string, string>,
        item?: PipelineGeneratorItem
    ): Promise<void> {
        const evalContext = {
            branch: input.branch,
            commitSha: input.commitSha,
            "item.name": item?.name,
            "item.path": item?.path,
            "item.children": item?.children.join(",")
        };

        if (!ExpressionEvaluator.evaluateWhen(job.when, evalContext)) {
            return;
        }

        await PipelineRunService.emitEvent(runId, {
            kind: "ci.job.started",
            message: job.name
        });

        if (item) {
            await PipelineRunService.emitEvent(runId, {
                kind: "ci.item.selected",
                message: item.name
            });
        }

        for (const step of job.steps) {
            await runStep(context, input, runId, step, vars, job);
        }

        if (job.artifacts && job.artifacts.paths.length > 0) {
            const prefix = interpolate(job.artifacts.prefix ?? `${input.branch}/${input.commitSha}`, vars);
            await S3ArtifactService.uploadPaths({
                localRoot: input.workDir,
                globPaths: job.artifacts.paths.map((artifactPath) => interpolate(artifactPath, vars)),
                bucket: job.artifacts.bucket,
                prefix
            });
        }

        await PipelineRunService.emitEvent(runId, {
            kind: "ci.job.finished",
            message: job.name
        });
    }

    /**
     * Runs a single pipeline step string or structured step.
     *
     * @param context Control plane context
     * @param input Execution input
     * @param runId Pipeline run id
     * @param step Step definition
     * @param vars Interpolation vars
     * @param job Parent job (sandbox)
     * @returns Nothing.
     */
    async function runStep(
        _context: ControlPlaneContext,
        input: PipelineCIExecuteInput,
        runId: string,
        step: PipelineJobStep,
        vars: Record<string, string>,
        job: PipelineJob
    ): Promise<void> {
        const normalized = normalizeStep(step);
        const evalContext = {
            branch: input.branch,
            commitSha: input.commitSha,
            ...vars
        };

        if (!ExpressionEvaluator.evaluateWhen(normalized.when, evalContext)) {
            return;
        }

        const command = interpolate(normalized.run, vars).trim();

        if (command.startsWith("@naulite/apply")) {
            const applyArgs = command.replace("@naulite/apply", "").trim().split(/\s+/);
            await runApplyStep(input.manifestYaml, applyArgs, vars, input.workDir, runId, {
                branch: input.branch,
                commitSha: input.commitSha
            });
            return;
        }

        if (command.startsWith("@naulite/preview-host")) {
            const action = command.replace("@naulite/preview-host", "").trim().split(/\s+/)[0] ?? "ensure";
            const previewDomain = vars.PREVIEW_DOMAIN ?? "lm.local.arpa";

            if (action === "teardown") {
                await PreviewHostService.teardownBranch(input.branch, previewDomain);
                return;
            }

            if (vars.TARGET?.trim()) {
                const presetHostname = PreviewHostService.hostnameForBranch(input.branch, previewDomain);
                await PreviewHostIngressService.ensurePreviewRoute(
                    presetHostname,
                    vars.TARGET.trim(),
                    PreviewHostService.serviceNameForBranch(input.branch)
                );
                await PipelineRunService.emitEvent(runId, {
                    kind: "ci.item.selected",
                    message: `preview target preset -> ${vars.TARGET.trim()} (${presetHostname})`
                });
                return;
            }

            const host = await PreviewHostService.ensurePreviewHost(input.branch, previewDomain);
            vars.TARGET = host.nodeId;

            await PipelineRunService.emitEvent(runId, {
                kind: "ci.item.selected",
                message: `preview ${host.hostname} -> ${host.nodeId}${host.reused ? " (reused)" : ""}`
            });
            return;
        }

        if (!job.sandbox?.parent) {
            await PipelineRunService.emitEvent(runId, {
                kind: "build.step.started",
                message: normalized.name ?? command.slice(0, 80)
            });

            const shellResult = await PipelineHostShellService.runShellCommand(command, {
                cwd: input.workDir,
                env: vars
            });

            if (shellResult.exitCode !== 0) {
                const detail = shellResult.stderr.trim() || shellResult.stdout.trim() || `exit ${shellResult.exitCode}`;
                throw new Error(`Host shell step failed: ${detail}`);
            }

            await PipelineRunService.emitEvent(runId, {
                kind: "build.step.finished",
                message: normalized.name ?? "step"
            });
            return;
        }

        const nodes = await ControlPlaneService.Store.listNodes();
        const builderNode = BuildService.resolveSandboxNode(nodes);

        if (!builderNode) {
            throw new Error("No sandbox-capable node is registered.");
        }

        const task: Task = {
            name: normalized.name ?? "pipeline-step",
            module: "build",
            command,
            sandbox: {
                parent: interpolate(job.sandbox.parent, vars),
                workdir: job.sandbox.workdir ? interpolate(job.sandbox.workdir, vars) : undefined,
                checkout: job.sandbox.checkout
            }
        };

        await SandboxService.executeBuild(builderNode.id, task, {
            runId,
            vars
        });
    }

    /**
     * Enqueues docker builds for every service that declares build.
     *
     * @param context Control plane context
     * @param input Execution input
     * @param runId Parent run id
     * @returns Nothing.
     */
    async function runImplicitDockerBuilds(
        context: ControlPlaneContext,
        input: PipelineCIExecuteInput,
        runId: string
    ): Promise<void> {
        const nodes = await ControlPlaneService.Store.listNodes();
        const serviceNames = Object.keys(input.manifest.services ?? {});

        for (const serviceName of serviceNames) {
            const service = input.manifest.services[serviceName];

            if (!service?.build) {
                continue;
            }

            await BuildService.enqueueBuild(context, nodes, serviceName, input.manifest, {
                commitSha: input.commitSha,
                branch: input.branch
            });
        }

        await ApplyService.execute(input.manifestYaml, {
            branch: input.branch,
            commitSha: input.commitSha,
            buildContextRoot: input.workDir,
            runId
        });
    }

    /**
     * Builds interpolation vars for a run.
     *
     * @param input Execution input
     * @returns String vars map
     */
    function buildVars(input: PipelineCIExecuteInput): Record<string, string> {
        return {
            BRANCH: input.branch,
            COMMIT_SHA: input.commitSha,
            ...(input.manifest.vars ?? {}),
            ...(input.runtimeVars ?? {})
        };
    }

    /**
     * Normalizes a step to name/run/when.
     *
     * @param step Pipeline step
     * @returns Normalized step
     */
    function normalizeStep(step: PipelineJobStep): { name?: string; run: string; when?: string } {
        if (typeof step === "string") {
            return {
                run: step
            };
        }

        return {
            name: step.name,
            run: step.run,
            when: step.when
        };
    }

    /**
     * Interpolates ${VAR} tokens in a string.
     *
     * @param template Source string
     * @param vars Variable map
     * @returns Interpolated string
     */
    function interpolate(template: string, vars: Record<string, string>): string {
        return template.replace(/\$\{([^}]+)\}/g, (_match, key: string) => {
            const trimmed = key.trim();
            const value = vars[trimmed];

            if (value !== undefined && value !== null) {
                return value;
            }

            return "";
        });
    }


    const nestedApplyPassthroughKeys = [
        "TARGET",
        "BRANCH",
        "COMMIT_SHA",
        "GITOPS_ROOT",
        "LM_BACKEND_HEALTH_URL",
        "NAULITE_CP_HEALTH_URL",
        "LM_BACKEND_PORT",
        "APP_NAME",
        "WORKSPACE_ROOT",
        "DEPLOY_ROOT"
    ];

    /**
     * Merges nested @naulite/apply playbook vars without leaking parent pipeline host vars.
     *
     * @param pipelineVars Parent pipeline interpolation vars
     * @param cliVars Vars parsed from `--var` tokens on the apply step
     * @returns Playbook vars for the nested manifest
     */
    function mergeNestedApplyPlaybookVars(
        pipelineVars: Record<string, string>,
        cliVars: Record<string, string>
    ): Record<string, string> {
        const merged: Record<string, string> = { ...cliVars };

        for (const key of nestedApplyPassthroughKeys) {
            if (merged[key]?.trim()) {
                continue;
            }

            const fromPipeline = pipelineVars[key];

            if (fromPipeline?.trim()) {
                merged[key] = fromPipeline;
            }
        }

        return merged;
    }

    /**
     * Parses `--var KEY=VALUE` tokens from an @naulite/apply argv list.
     *
     * @param applyArgs Tokens after @naulite/apply
     * @param vars Pipeline vars used to resolve nested ${VAR} in values
     * @returns Extra playbook vars for the nested manifest
     */
    function parseApplyCliVars(applyArgs: string[], vars: Record<string, string>): Record<string, string> {
        const parsed: Record<string, string> = {};

        for (let index = 0; index < applyArgs.length; index += 1) {
            const token = applyArgs[index];

            if (token !== "--var" && token !== "-v") {
                continue;
            }

            const raw = applyArgs[index + 1];

            if (!raw) {
                continue;
            }

            const equalsAt = raw.indexOf("=");

            if (equalsAt <= 0) {
                continue;
            }

            const key = raw.slice(0, equalsAt).trim();
            const value = interpolate(raw.slice(equalsAt + 1), {
                ...vars,
                ...parsed
            });
            parsed[key] = value;
            index += 1;
        }

        return parsed;
    }

    /**
     * Flattens stage status into expression keys.
     *
     * @param stageStatus Stage name to status
     * @returns Context entries
     */
    function flattenStageStatus(stageStatus: Record<string, string>): Record<string, string> {
        const result: Record<string, string> = {};

        for (const [name, status] of Object.entries(stageStatus)) {
            result[`stage.${name}.status`] = status;
        }

        return result;
    }

    /**
     * Reads a UTF-8 file.
     *
     * @param path Absolute path
     * @returns File contents
     */
    async function readFileUtf8(path: string): Promise<string> {
        const { readFile } = await import("node:fs/promises");
        return readFile(path, "utf8");
    }
}
