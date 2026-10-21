import type { Manifest } from "@naulite/shared";

import type { ControlPlaneContext } from "../../ControlPlaneContext";
import { ComposeParser } from "../../orchestration/ComposeParser";
import { PipelineCIService } from "../PipelineCIService";
import { PipelineRunService } from "../PipelineRunService";
import { PipelineCoalesceService } from "./PipelineCoalesceService";
import { PreviewHostService } from "./PreviewHostService";
import { TriggerRoutingResolver } from "./TriggerRoutingResolver";
import { ExpressionEvaluator } from "./ExpressionEvaluator";
import { FanoutRoutingService } from "./FanoutRoutingService";

/**
 * Webhook payload for pipeline scheduling.
 */
export interface GitOpsPipelineWebhookInput {
    manifestYaml: string;
    manifestName: string;
    workDir: string;
    repositoryUrl: string;
    repositoryFullName?: string;
    branch: string;
    commitSha: string;
    deliveryId?: string;
    deleted?: boolean;
    runtimeVars?: Record<string, string>;
}

/**
 * Schedules CI pipeline runs from GitOps webhooks with coalesce semantics.
 */
export namespace GitOpsPipelineTriggerService {
    /**
     * Handles a repository push or delete against a checked-out manifest.
     *
     * @param context Control plane context
     * @param input Webhook-derived input
     * @returns Run id when scheduled or existing, undefined when skipped
     */
    export async function handleRepositoryEvent(
        context: ControlPlaneContext,
        input: GitOpsPipelineWebhookInput
    ): Promise<{ runId?: string; skipped?: boolean }> {
        const parser = new ComposeParser();
        const manifest = parser.parse(input.manifestYaml);
        const pipeline = manifest.pipeline;

        if (!pipeline) {
            return {
                skipped: true
            };
        }

        if (input.deleted) {
            const deleteTrigger = pipeline.triggers?.delete;

            if (!deleteTrigger || !branchMatches(deleteTrigger.branches, input.branch)) {
                return {
                    skipped: true
                };
            }

            if (!ExpressionEvaluator.evaluateWhen(deleteTrigger.when, {
                branch: input.branch,
                commitSha: input.commitSha
            })) {
                return {
                    skipped: true
                };
            }

            const coalesceKey = buildCoalesceKey(manifest, input.branch, previewSlug(input.branch) ?? "all");
            PipelineCoalesceService.cancelPending(coalesceKey);

            const previewDomain = manifest.vars?.PREVIEW_DOMAIN ?? "lm.local.arpa";
            await PreviewHostService.teardownBranch(input.branch, previewDomain);

            return {
                skipped: true
            };
        }

        const pushTrigger = pipeline.triggers?.push;

        if (!pushTrigger || !branchMatches(pushTrigger.branches, input.branch)) {
            return {
                skipped: true
            };
        }

        if (!ExpressionEvaluator.evaluateWhen(pushTrigger.when, {
            branch: input.branch,
            commitSha: input.commitSha
        })) {
            return {
                skipped: true
            };
        }

        if (input.deliveryId) {
            const existing = PipelineCoalesceService.findRunByDeliveryId(input.deliveryId);

            if (existing) {
                return {
                    runId: existing
                };
            }
        }

        const fanoutScope = resolveFanoutScope(manifest, input.repositoryFullName);
        const scopeSegment = FanoutRoutingService.coalesceScopeKey(
            fanoutScope,
            input.branch,
            previewSlug(input.branch)
        );
        const coalesceKey = buildCoalesceKey(manifest, input.branch, scopeSegment);
        const windowMs = pushTrigger.coalesce
            ? PipelineCoalesceService.parseWindowMs(pushTrigger.coalesce.window)
            : 0;

        if (windowMs <= 0) {
            const runId = await startRun(context, manifest, input, fanoutScope);
            PipelineCoalesceService.markRunning(coalesceKey, runId);

            if (input.deliveryId) {
                PipelineCoalesceService.rememberDelivery(input.deliveryId, runId);
            }

            void finishWithFollowUp(context, coalesceKey, windowMs, manifest, input, fanoutScope, runId);

            return {
                runId
            };
        }

        await PipelineCoalesceService.schedule(coalesceKey, windowMs, input.deliveryId ?? "", async () => {
            const runId = await startRun(context, manifest, input, fanoutScope);
            PipelineCoalesceService.markRunning(coalesceKey, runId);

            if (input.deliveryId) {
                PipelineCoalesceService.rememberDelivery(input.deliveryId, runId);
            }

            void finishWithFollowUp(context, coalesceKey, windowMs, manifest, input, fanoutScope, runId);
        });

        return {};
    }

    /**
     * Starts a pipeline run immediately (manual trigger).
     *
     * @param context Control plane context
     * @param input Webhook-shaped input
     * @returns Run id
     */
    export async function triggerNow(
        context: ControlPlaneContext,
        input: GitOpsPipelineWebhookInput
    ): Promise<string> {
        const parser = new ComposeParser();
        const manifest = parser.parse(input.manifestYaml);
        const fanoutScope = resolveFanoutScope(manifest, input.repositoryFullName);

        return startRun(context, manifest, input, fanoutScope);
    }

    /**
     * Starts the CI pipeline run.
     *
     * @param context Control plane context
     * @param manifest Parsed manifest
     * @param input Webhook input
     * @param fanoutScope Fan-out scope
     * @returns Run id
     */
    async function startRun(
        context: ControlPlaneContext,
        manifest: Manifest,
        input: GitOpsPipelineWebhookInput,
        fanoutScope: ReturnType<typeof resolveFanoutScope>
    ): Promise<string> {
        return PipelineCIService.execute(context, {
            manifest,
            manifestYaml: input.manifestYaml,
            workDir: input.workDir,
            branch: input.branch,
            commitSha: input.commitSha,
            fanoutScope,
            runtimeVars: input.runtimeVars
        });
    }

    /**
     * Marks run finished and schedules follow-up when needed.
     *
     * @param context Control plane context
     * @param coalesceKey Coalesce key
     * @param windowMs Debounce window
     * @param manifest Manifest
     * @param input Webhook input
     * @param fanoutScope Fan-out scope
     * @param runId Started run id
     * @returns Nothing.
     */
    async function finishWithFollowUp(
        context: ControlPlaneContext,
        coalesceKey: string,
        windowMs: number,
        manifest: Manifest,
        input: GitOpsPipelineWebhookInput,
        fanoutScope: ReturnType<typeof resolveFanoutScope>,
        runId: string
    ): Promise<void> {
        try {
            await waitForRun(runId);
        } finally {
            await PipelineCoalesceService.markFinished(coalesceKey, windowMs, async () => {
                await startRun(context, manifest, input, fanoutScope);
            });
        }
    }

    /**
     * Polls until the pipeline run leaves the running state.
     *
     * @param runId Run id
     * @returns Nothing.
     */
    async function waitForRun(runId: string): Promise<void> {
        for (let attempt = 0; attempt < 3600; attempt++) {
            const run = await PipelineRunService.getRun(runId);

            if (!run || run.status === "succeeded" || run.status === "failed") {
                return;
            }

            await sleep(1000);
        }
    }

    /**
     * Resolves fan-out scope from push trigger rules.
     *
     * @param manifest Manifest
     * @param pushTrigger Push trigger block
     * @param repositoryFullName Repository full name
     * @returns Fan-out scope or null
     */
    function resolveFanoutScope(manifest: Manifest, repositoryFullName?: string) {
        const fanout = manifest.pipeline?.triggers?.push?.fanout;

        if (!fanout || !repositoryFullName) {
            return null;
        }

        return TriggerRoutingResolver.resolveScope(fanout.rules, repositoryFullName);
    }

    /**
     * Builds coalesce key for a manifest.
     *
     * @param manifest Manifest
     * @param branch Branch name
     * @param scopeSegment Scope segment
     * @returns Coalesce key
     */
    function buildCoalesceKey(manifest: Manifest, branch: string, scopeSegment: string): string {
        return TriggerRoutingResolver.buildCoalesceKey(manifest.name, branch, scopeSegment);
    }

    /**
     * Matches a branch against optional glob patterns.
     *
     * @param patterns Branch patterns
     * @param branch Branch name
     * @returns True when allowed
     */
    function branchMatches(patterns: string[] | undefined, branch: string): boolean {
        if (!patterns || patterns.length === 0) {
            return true;
        }

        for (const pattern of patterns) {
            const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");

            if (regex.test(branch)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Preview slug for EVEN-* branches.
     *
     * @param branch Branch name
     * @returns Slug or undefined
     */
    function previewSlug(branch: string): string | undefined {
        if (!branch.startsWith("EVEN-")) {
            return undefined;
        }

        return branch.toLowerCase();
    }

    /**
     * Sleeps for the given duration.
     *
     * @param ms Milliseconds
     * @returns Nothing.
     */
    function sleep(ms: number): Promise<void> {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }
}
