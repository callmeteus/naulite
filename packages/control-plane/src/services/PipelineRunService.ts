import { randomBytes } from "node:crypto";

import { Op } from "sequelize";
import type {
    PipelineEvent,
    PipelineEventKind,
    PipelineNotificationEvent,
    PipelineRun,
    PipelineRunKind,
    PipelineRunStatus,
    PipelineStep,
    PaginatedList
} from "@naulite/shared";
import { buildPaginatedList, paginationOffset } from "@naulite/shared";

import { Logger } from "../Logger";
import {
    PipelineEventModel,
    PipelineRunModel,
    PipelineStepModel
} from "../database/models/index";

import { RunNotificationDispatcher } from "./RunNotificationDispatcher";
const logPipeline = Logger.create("pipeline");

/**
 * Maximum failure log bytes retained on a pipeline run.
 */
const FAILURE_LOG_MAX_BYTES = 512 * 1024;

/**
 * Input for creating a pipeline run.
 */
export interface CreatePipelineRunInput {
    kind: PipelineRunKind;
    manifestName?: string;
    serviceName?: string;
    imageRef?: string;
    commitSha?: string;
    branch?: string;
    revisionId?: string;
    workflowId?: string;
    pool?: string;
    nodeId?: string;
    nodeHostname?: string;
}

/**
 * Filters for listing pipeline runs.
 */
export interface ListPipelineRunsFilters {
    kind?: PipelineRunKind;
    status?: PipelineRunStatus;
    service?: string;
    pool?: string;
    since?: string;
    page?: number;
    limit?: number;
}

/**
 * Orchestrates pipeline run persistence, events, and notifications.
 */
export namespace PipelineRunService {
    /**
     * Generates a short workflow identifier.
     *
     * @param serviceName Service name used as prefix
     * @returns Workflow id string
     */
    export function createWorkflowId(serviceName: string): string {
        const suffix = randomBytes(3).toString("hex").slice(0, 5);
        return `${serviceName}-${suffix}`;
    }

    /**
     * Creates a new pipeline run row.
     *
     * @param input Run creation payload
     * @returns Persisted pipeline run
     * @throws {Error} {@link Error}
     */
    export async function createRun(input: CreatePipelineRunInput): Promise<PipelineRun> {
        const now = new Date().toISOString();
        const workflowId = input.workflowId ?? createWorkflowId(input.serviceName ?? input.kind);
        const id = workflowId;

        await PipelineRunModel.create({
            id,
            kind: input.kind,
            status: "pending",
            manifestName: input.manifestName ?? null,
            serviceName: input.serviceName ?? null,
            imageRef: input.imageRef ?? null,
            commitSha: input.commitSha ?? null,
            branch: input.branch ?? null,
            revisionId: input.revisionId ?? null,
            workflowId,
            pool: input.pool ?? null,
            nodeId: input.nodeId ?? null,
            nodeHostname: input.nodeHostname ?? null,
            startedAt: now,
            completedAt: null,
            errorMessage: null,
            failureLog: null,
            createdAt: now
        });

        logPipeline.debug("run created id=%s kind=%s service=%s",
            id,
            input.kind,
            input.serviceName ?? "-"
        );

        const run = await getRun(id);

        if (!run) {
            throw new Error(`Failed to load pipeline run ${id}.`);
        }

        return run;
    }

    /**
     * Marks a pipeline run as running.
     *
     * @param runId Pipeline run identifier
     * @returns Updated pipeline run
     */
    /**
     * Updates mutable pipeline run fields (gate state, pending plan).
     *
     * @param runId Pipeline run identifier
     * @param fields Fields to update
     * @returns Updated pipeline run
     */
    export async function updateRunFields(
        runId: string,
        fields: {
            status?: PipelineRunStatus;
            createdBy?: string | null;
            gateStepId?: string | null;
            pendingPlan?: unknown | null;
            approvedBy?: string | null;
        }
    ): Promise<PipelineRun | null> {
        const row = await PipelineRunModel.findByPk(runId);

        if (!row) {
            return null;
        }

        await row.update({
            status: fields.status ?? row.status,
            createdBy: fields.createdBy === undefined ? row.get("createdBy") : fields.createdBy,
            gateStepId: fields.gateStepId === undefined ? row.get("gateStepId") : fields.gateStepId,
            pendingPlan: fields.pendingPlan === undefined
                ? row.get("pendingPlan")
                : fields.pendingPlan === null ? null : JSON.stringify(fields.pendingPlan),
            approvedBy: fields.approvedBy === undefined ? row.get("approvedBy") : fields.approvedBy
        });

        return getRun(runId);
    }

    export async function markRunning(runId: string): Promise<PipelineRun | null> {
        const row = await PipelineRunModel.findByPk(runId);

        if (!row) {
            return null;
        }

        await row.update({
            status: "running",
            startedAt: row.startedAt ?? new Date().toISOString()
        });

        return getRun(runId);
    }

    /**
     * Completes a pipeline run with final status.
     *
     * @param runId Pipeline run identifier
     * @param status Final run status
     * @param options Optional error metadata
     * @returns Updated pipeline run
     */
    export async function completeRun(
        runId: string,
        status: Extract<PipelineRunStatus, "succeeded" | "failed">,
        options: {
            errorMessage?: string;
            failureLog?: string;
        } = {}
    ): Promise<PipelineRun | null> {
        const row = await PipelineRunModel.findByPk(runId);

        if (!row) {
            return null;
        }

        await row.update({
            status,
            completedAt: new Date().toISOString(),
            errorMessage: options.errorMessage ?? null,
            failureLog: options.failureLog ? truncateFailureLog(options.failureLog) : row.failureLog
        });

        const run = await getRun(runId);

        if (run) {
            const kind: PipelineEventKind = status === "succeeded"
                ? run.kind === "ci_build" ? "ci.build.finished" : "infra.sync.finished"
                : "ci.pipeline.failed";

            await emitEvent(runId, {
                kind,
                message: options.errorMessage ?? (status === "succeeded" ? "Run succeeded." : "Run failed."),
                level: status === "succeeded" ? "info" : "error"
            });
        }

        return run;
    }

    /**
     * Creates or updates a pipeline step and emits step events.
     *
     * @param runId Pipeline run identifier
     * @param stepName Step name
     * @param status Step status transition
     * @param options Optional step metadata
     * @returns Persisted pipeline step
     */
    export async function transitionStep(
        runId: string,
        stepName: string,
        status: "running" | "succeeded" | "failed",
        options: {
            order?: number;
            exitCode?: number;
            logText?: string;
            nodeId?: string;
            nodeHostname?: string;
            pool?: string;
            message?: string;
            eventKind?: PipelineEventKind | string;
        } = {}
    ): Promise<PipelineStep | null> {
        const now = new Date().toISOString();
        const stepId = `${runId}:${stepName}`;
        let row = await PipelineStepModel.findByPk(stepId);

        if (!row) {
            const order = options.order ?? await nextStepOrder(runId);
            row = await PipelineStepModel.create({
                id: stepId,
                runId,
                name: stepName,
                order,
                status,
                nodeId: options.nodeId ?? null,
                pool: options.pool ?? null,
                startedAt: status === "running" ? now : null,
                completedAt: status === "succeeded" || status === "failed" ? now : null,
                exitCode: options.exitCode ?? null,
                logText: options.logText ?? null
            });
        } else {
            await row.update({
                status,
                nodeId: options.nodeId ?? row.nodeId,
                pool: options.pool ?? row.pool,
                startedAt: row.startedAt ?? (status === "running" ? now : row.startedAt),
                completedAt: status === "succeeded" || status === "failed" ? now : row.completedAt,
                exitCode: options.exitCode ?? row.exitCode,
                logText: options.logText ?? row.logText
            });
        }

        const eventKind: PipelineEventKind | string = options.eventKind ?? (status === "running"
            ? "build.step.started"
            : status === "succeeded"
                ? "build.step.finished"
                : "ci.pipeline.failed");

        await emitEvent(runId, {
            kind: eventKind,
            stepId,
            stepName,
            message: options.message ?? `Build step ${stepName}`,
            exitCode: options.exitCode,
            logText: options.logText,
            nodeId: options.nodeId,
            pool: options.pool,
            level: status === "failed" ? "error" : "info"
        });

        return mapStep(row.get({ plain: true }));
    }

    /**
     * Appends a timeline event to a pipeline run.
     *
     * @param runId Pipeline run identifier
     * @param input Event payload
     * @returns Persisted pipeline event
     */
    export async function emitEvent(
        runId: string,
        input: {
            kind: PipelineEventKind | string;
            message: string;
            level?: "debug" | "info" | "warn" | "error";
            emoji?: string;
            stepId?: string;
            stepName?: string;
            exitCode?: number;
            logText?: string;
            metadata?: Record<string, unknown>;
            nodeId?: string;
            nodeHostname?: string;
            pool?: string;
        }
    ): Promise<PipelineEvent> {
        const run = await PipelineRunModel.findByPk(runId);
        const createdAt = new Date().toISOString();

        if (input.logText && run) {
            const merged = `${run.failureLog ?? ""}${input.logText}`;
            await run.update({ failureLog: truncateFailureLog(merged) });
        }

        const row = await PipelineEventModel.create({
            runId,
            stepId: input.stepId ?? null,
            kind: input.kind,
            level: input.level ?? "info",
            message: input.message,
            emoji: input.emoji ?? null,
            metadata: {
                ...(input.metadata ?? {}),
                stepName: input.stepName,
                exitCode: input.exitCode,
                nodeId: input.nodeId,
                nodeHostname: input.nodeHostname,
                pool: input.pool
            },

            createdAt
        });

        const event = mapEvent(row.get({ plain: true }));

        if (run) {
            const notification = buildNotificationEvent(run.get({ plain: true }), event, input);
            await RunNotificationDispatcher.dispatch(notification);
        }

        logPipeline.debug("event runId=%s kind=%s message=%s", runId, input.kind, input.message);

        return event;
    }

    /**
     * Links a pipeline run to a recorded git revision.
     *
     * @param runId Pipeline run identifier
     * @param revisionId Git revision identifier
     * @returns Updated pipeline run when found
     */
    export async function linkRevision(runId: string, revisionId: string): Promise<PipelineRun | null> {
        const row = await PipelineRunModel.findByPk(runId);

        if (!row) {
            return null;
        }

        await row.update({ revisionId });
        logPipeline.debug("run linked runId=%s revisionId=%s", runId, revisionId);

        return getRun(runId);
    }

    /**
     * Lists pipeline runs using optional filters.
     *
     * @param filters List filters
     * @returns Matching pipeline runs
     */
    export async function listRuns(filters: ListPipelineRunsFilters = {}): Promise<PaginatedList<PipelineRun>> {
        const where: Record<string, unknown> = {};
        const page = filters.page ?? 1;
        const limit = filters.limit ?? 50;

        if (filters.kind) {
            where.kind = filters.kind;
        }

        if (filters.status) {
            where.status = filters.status;
        }

        if (filters.service) {
            where.serviceName = filters.service;
        }

        if (filters.pool) {
            where.pool = filters.pool;
        }

        if (filters.since) {
            where.createdAt = { [Op.gte]: filters.since };
        }

        const { count, rows } = await PipelineRunModel.findAndCountAll({
            where,
            order: [["createdAt", "DESC"]],
            limit,
            offset: paginationOffset(page, limit)
        });

        return buildPaginatedList(
            rows.map((row) => mapRun(row.get({ plain: true }))),
            count,
            page,
            limit
        );
    }

    /**
     * Loads a pipeline run with steps and recent events.
     *
     * @param runId Pipeline run identifier
     * @returns Pipeline run detail when found
     */
    export async function getRun(runId: string): Promise<PipelineRun | null> {
        const row = await PipelineRunModel.findByPk(runId);

        if (!row) {
            return null;
        }

        const [steps, events] = await Promise.all([
            PipelineStepModel.findAll({
                where: { runId },
                order: [["order", "ASC"]]
            }),
            PipelineEventModel.findAll({
                where: { runId },
                order: [["id", "ASC"]],
                limit: 200
            })
        ]);

        return {
            ...mapRun(row.get({ plain: true })),
            steps: steps.map((step) => mapStep(step.get({ plain: true }))),
            events: events.map((event) => mapEvent(event.get({ plain: true })))
        };
    }

    /**
     * Lists events for a pipeline run.
     *
     * @param runId Pipeline run identifier
     * @param sinceEventId Optional event id lower bound
     * @returns Timeline events
     */
    export async function listEvents(runId: string, sinceEventId?: number): Promise<PipelineEvent[]> {
        const where: Record<string, unknown> = { runId };

        if (sinceEventId !== undefined) {
            where.id = { [Op.gt]: sinceEventId };
        }

        const rows = await PipelineEventModel.findAll({
            where,
            order: [["id", "ASC"]],
            limit: 500
        });

        return rows.map((row) => mapEvent(row.get({ plain: true })));
    }

    /**
     * Resolves pool label from node labels.
     *
     * @param labels Node label map
     * @returns Pool label when configured
     */
    export function resolvePoolFromLabels(labels: Record<string, unknown>): string | undefined {
        const platformPool = labels["platform.pool"];

        if (typeof platformPool === "string" && platformPool.length > 0) {
            return platformPool;
        }

        const legacyPool = labels.pool;

        if (typeof legacyPool === "string" && legacyPool.length > 0) {
            return legacyPool;
        }

        return undefined;
    }

    /**
     * Computes next step order for a run.
     *
     * @param runId Pipeline run identifier
     * @returns Next order index
     */
    async function nextStepOrder(runId: string): Promise<number> {
        const count = await PipelineStepModel.count({ where: { runId } });
        return count;
    }

    /**
     * Truncates failure logs to the configured maximum size.
     *
     * @param value Raw failure log text
     * @returns Truncated log text
     */
    function truncateFailureLog(value: string): string {
        if (value.length <= FAILURE_LOG_MAX_BYTES) {
            return value;
        }

        return value.slice(value.length - FAILURE_LOG_MAX_BYTES);
    }

    /**
     * Maps a pipeline run database row.
     *
     * @param plain Sequelize plain row
     * @returns Pipeline run DTO
     */
    function mapRun(plain: Record<string, unknown>): PipelineRun {
        return {
            id: String(plain.id),
            kind: plain.kind as PipelineRunKind,
            status: plain.status as PipelineRunStatus,
            manifestName: plain.manifestName ? String(plain.manifestName) : undefined,
            serviceName: plain.serviceName ? String(plain.serviceName) : undefined,
            imageRef: plain.imageRef ? String(plain.imageRef) : undefined,
            commitSha: plain.commitSha ? String(plain.commitSha) : undefined,
            branch: plain.branch ? String(plain.branch) : undefined,
            revisionId: plain.revisionId ? String(plain.revisionId) : undefined,
            workflowId: plain.workflowId ? String(plain.workflowId) : undefined,
            pool: plain.pool ? String(plain.pool) : undefined,
            nodeId: plain.nodeId ? String(plain.nodeId) : undefined,
            nodeHostname: plain.nodeHostname ? String(plain.nodeHostname) : undefined,
            startedAt: plain.startedAt ? String(plain.startedAt) : undefined,
            completedAt: plain.completedAt ? String(plain.completedAt) : undefined,
            errorMessage: plain.errorMessage ? String(plain.errorMessage) : undefined,
            failureLog: plain.failureLog ? String(plain.failureLog) : undefined,
            createdBy: plain.createdBy ? String(plain.createdBy) : undefined,
            gateStepId: plain.gateStepId ? String(plain.gateStepId) : undefined,
            pendingPlan: parsePendingPlan(plain.pendingPlan),
            approvedBy: plain.approvedBy ? String(plain.approvedBy) : undefined,
            createdAt: String(plain.createdAt)
        };
    }

    /**
     * Parses pending plan JSON from storage.
     *
     * @param value Raw database value
     * @returns Parsed pending plan or undefined
     */
    function parsePendingPlan(value: unknown): Record<string, unknown> | undefined {
        if (!value) {
            return undefined;
        }

        if (typeof value === "object") {
            return value as Record<string, unknown>;
        }

        if (typeof value === "string") {
            try {
                return JSON.parse(value) as Record<string, unknown>;
            } catch {
                return undefined;
            }
        }

        return undefined;
    }

    /**
     * Maps a pipeline step database row.
     *
     * @param plain Sequelize plain row
     * @returns Pipeline step DTO
     */
    function mapStep(plain: Record<string, unknown>): PipelineStep {
        return {
            id: String(plain.id),
            runId: String(plain.runId),
            name: String(plain.name),
            order: Number(plain.order),
            status: plain.status as PipelineStep["status"],
            nodeId: plain.nodeId ? String(plain.nodeId) : undefined,
            pool: plain.pool ? String(plain.pool) : undefined,
            startedAt: plain.startedAt ? String(plain.startedAt) : undefined,
            completedAt: plain.completedAt ? String(plain.completedAt) : undefined,
            exitCode: plain.exitCode === null || plain.exitCode === undefined ? undefined : Number(plain.exitCode),
            logText: plain.logText ? String(plain.logText) : undefined
        };
    }

    /**
     * Maps a pipeline event database row.
     *
     * @param plain Sequelize plain row
     * @returns Pipeline event DTO
     */
    function mapEvent(plain: Record<string, unknown>): PipelineEvent {
        return {
            id: Number(plain.id),
            runId: String(plain.runId),
            stepId: plain.stepId ? String(plain.stepId) : undefined,
            kind: plain.kind as PipelineEventKind,
            level: (plain.level as PipelineEvent["level"]) ?? "info",
            message: String(plain.message),
            emoji: plain.emoji ? String(plain.emoji) : undefined,
            metadata: (plain.metadata as Record<string, unknown>) ?? {},
            createdAt: String(plain.createdAt)
        };
    }

    /**
     * Builds a notification payload from run and event rows.
     *
     * @param run Plain pipeline run row
     * @param event Persisted pipeline event
     * @param input Original emit input
     * @returns Notification payload
     */
    function buildNotificationEvent(
        run: Record<string, unknown>,
        event: PipelineEvent,
        input: {
            stepName?: string;
            exitCode?: number;
            nodeId?: string;
            nodeHostname?: string;
            pool?: string;
        }
    ): PipelineNotificationEvent {
        return {
            kind: event.kind,
            runId: String(run.id),
            workflowId: run.workflowId ? String(run.workflowId) : undefined,
            manifestName: run.manifestName ? String(run.manifestName) : undefined,
            serviceName: run.serviceName ? String(run.serviceName) : undefined,
            imageRef: run.imageRef ? String(run.imageRef) : undefined,
            commitSha: run.commitSha ? String(run.commitSha) : undefined,
            branch: run.branch ? String(run.branch) : undefined,
            pool: input.pool ?? (run.pool ? String(run.pool) : undefined),
            nodeId: input.nodeId ?? (run.nodeId ? String(run.nodeId) : undefined),
            nodeHostname: input.nodeHostname ?? (run.nodeHostname ? String(run.nodeHostname) : undefined),
            stepName: input.stepName,
            exitCode: input.exitCode,
            message: event.message,
            failureLog: run.failureLog ? String(run.failureLog) : undefined,
            metadata: event.metadata,
            createdAt: event.createdAt
        };
    }
}
