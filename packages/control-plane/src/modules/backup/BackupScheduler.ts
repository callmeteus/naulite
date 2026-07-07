import { randomUUID } from "node:crypto";

import { Op } from "sequelize";

import type { BackupTask, Volume } from "@naulite/shared";

import { BackupRunModel, NodeModel, VolumeModel } from "../../database/models/index";
import { AgentProxyService } from "../../services/AgentProxyService";
import { BackupCompletionService } from "../../services/BackupCompletionService";
import { RowMapper } from "../../util/RowMapper";
import { CronEvaluator } from "../log-rotation/CronEvaluator";
import type { BackupOrchestrator } from "./BackupOrchestrator";
import { Logger } from "../../Logger";
const log_backups = Logger.create("backups");


/**
 * Dispatches a JSON task payload to a node agent.
 */
export type SchedulerDispatchFn = (
    agentUrl: string,
    path: string,
    payload: unknown
) => Promise<unknown>;

/**
 * Optional backup scheduler dependencies.
 */
export interface BackupSchedulerOptions {
    backupOrchestrator?: BackupOrchestrator;
    onComplete?: (result: { location: string; provider: string }) => Promise<void> | void;
    isLeader?: () => boolean;
}

/**
 * Cron-like backup scheduler for volume backup policies.
 */
export class BackupScheduler {
    private intervalHandle: NodeJS.Timeout | null = null;
    private readonly backupOrchestrator?: BackupOrchestrator;
    private readonly onComplete?: BackupSchedulerOptions["onComplete"];
    private readonly isLeader: () => boolean;

    /**
     * Creates a backup scheduler.
     *
     * @param pollIntervalMs Poll interval in milliseconds
     * @param dispatchTask Agent task dispatcher used during ticks
     * @param options Optional orchestrator, completion hook, and leader gate
     */
    constructor(
        private readonly pollIntervalMs: number = 60_000,
        private readonly dispatchTask: SchedulerDispatchFn = AgentProxyService.postTask,
        options: BackupSchedulerOptions = {}
    ) {
        this.backupOrchestrator = options.backupOrchestrator;
        this.onComplete = options.onComplete;
        this.isLeader = options.isLeader ?? (() => true);
    }

    /**
     * Starts polling volumes with backup policies.
     *
     * @returns Nothing.
     */
    start(): void {
        if (this.intervalHandle) {
            return;
        }

        this.intervalHandle = setInterval(() => {
            void this.tick().catch((err) => {
                log_backups.debug("scheduler tick failed err=%o", err);
            });
        }, this.pollIntervalMs);
    }

    /**
     * Stops the backup scheduler loop.
     *
     * @returns Nothing.
     */
    stop(): void {
        if (this.intervalHandle) {
            clearInterval(this.intervalHandle);
            this.intervalHandle = null;
        }
    }

    /**
     * Evaluates backup policies and enqueues backup runs.
     *
     * @returns Nothing.
     */
    async tick(): Promise<void> {
        if (!this.isLeader()) {
            log_backups.debug("scheduler tick skipped reason=not-leader");
            return;
        }

        const now = new Date();
        const rows = await VolumeModel.findAll();

        for (const row of rows) {
            const volume = RowMapper.volume(row.get({ plain: true }));

            if (!volume.backup) {
                continue;
            }

            if (!CronEvaluator.isDue(volume.backup.schedule, now)) {
                continue;
            }

            if (await this.hasRecentRun(volume.id, now)) {
                log_backups.debug("skip recent run volume=%s", volume.name);
                continue;
            }

            await this.enqueueBackupRun(volume, now);
        }
    }

    /**
     * Enqueues a backup run for a volume.
     *
     * @param volume Volume with a backup policy
     * @param now Current evaluation timestamp
     * @returns Nothing.
     */
    private async enqueueBackupRun(volume: Volume, now: Date): Promise<void> {
        const node = await this.resolveNode(volume.nodeId);
        if (!node?.agentUrl) {
            log_backups.debug("skip dispatch volume=%s reason=no-agent", volume.name);
            return;
        }

        const taskId = randomUUID();
        const createdAt = now.toISOString();
        const payload = {
            taskId,
            volumeId: volume.id,
            volumeName: volume.name,
            nodeId: node.id,
            includes: volume.backup?.includes ?? [],
            excludes: volume.backup?.excludes ?? [],
            retention: volume.backup?.retention,
            destination: volume.backup?.destination,
            resolvedSecrets: {},
            status: "pending" as const
        };

        await BackupRunModel.create({
            id: taskId,
            volumeId: volume.id,
            volumeName: volume.name,
            nodeId: node.id,
            status: "pending",
            payload,
            createdAt
        });

        try {
            const agentResponse = await this.dispatchTask(node.agentUrl, "/tasks/backup", {
                taskId,
                volumeId: volume.id,
                volumeName: volume.name,
                mountPath: volume.mountPath,
                includes: payload.includes,
                excludes: payload.excludes,
                retention: payload.retention,
                destination: payload.destination
            });

            await BackupRunModel.update(
                { status: "running", startedAt: createdAt },
                { where: { id: taskId } }
            );

            log_backups.debug("dispatched taskId=%s volume=%s node=%s", taskId, volume.name, node.id);

            if (this.backupOrchestrator) {
                const task: BackupTask = {
                    taskId,
                    volumeId: volume.id,
                    volumeName: volume.name,
                    nodeId: node.id,
                    includes: payload.includes,
                    excludes: payload.excludes,
                    retention: payload.retention,
                    destination: payload.destination ?? {
                        provider: "local",
                        path: "/var/lib/naulite/backups"
                    },
                    resolvedSecrets: payload.resolvedSecrets,
                    status: "running"
                };
                const result = await BackupCompletionService.completeRun(
                    this.backupOrchestrator,
                    task,
                    agentResponse,
                    { agentUrl: node.agentUrl }
                );

                if (this.onComplete) {
                    await this.onComplete(result);
                }
            }
        } catch (err) {
            await BackupRunModel.update(
                {
                    status: "failed",
                    errorMessage: err instanceof Error ? err.message : String(err),
                    completedAt: createdAt
                },
                { where: { id: taskId } }
            );
            log_backups.debug("dispatch failed taskId=%s volume=%s err=%o", taskId, volume.name, err);
        }
    }

    /**
     * Returns whether a backup run already exists for the current cron minute.
     *
     * @param volumeId Volume identifier
     * @param now Current evaluation timestamp
     * @returns Whether a recent run exists
     */
    private async hasRecentRun(volumeId: string, now: Date): Promise<boolean> {
        const minuteStart = new Date(Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate(),
            now.getUTCHours(),
            now.getUTCMinutes(),
            0,
            0
        ));

        const count = await BackupRunModel.count({
            where: {
                volumeId,
                createdAt: {
                    [Op.gte]: minuteStart.toISOString()
                }
            }
        });

        return count > 0;
    }

    /**
     * Resolves the node responsible for a volume backup.
     *
     * @param nodeId Preferred node identifier from the volume
     * @returns Node row when available
     */
    private async resolveNode(nodeId?: string) {
        if (nodeId) {
            const node = await NodeModel.findByPk(nodeId);
            if (node) {
                return RowMapper.node(node.get({ plain: true }));
            }
        }

        const fallback = await NodeModel.findOne();
        return fallback ? RowMapper.node(fallback.get({ plain: true })) : undefined;
    }
}
