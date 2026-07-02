import { randomUUID } from "node:crypto";

import type { Volume } from "@platform/shared";

import { BackupRunModel, VolumeModel } from "../database/models/index.js";
import { RowMapper } from "../util/RowMapper.js";

/**
 * Cron-like backup scheduler for volume backup policies.
 */
export class BackupScheduler {
    private intervalHandle: NodeJS.Timeout | null = null;

    /**
     * Creates a backup scheduler.
     *
     * @param pollIntervalMs Poll interval in milliseconds
     */
    constructor(private readonly pollIntervalMs: number = 60_000) {}

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
            void this.tick().catch(() => undefined);
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
        const rows = await VolumeModel.findAll();

        for (const row of rows) {
            const volume = RowMapper.volume(row.get({ plain: true }));

            if (!volume.backup) {
                continue;
            }

            await this.enqueueBackupRun(volume);
        }
    }

    /**
     * Enqueues a backup run for a volume.
     *
     * @param volume Volume with a backup policy
     * @returns Nothing.
     */
    private async enqueueBackupRun(volume: Volume): Promise<void> {
        const now = new Date().toISOString();
        const payload = {
            taskId: randomUUID(),
            volumeId: volume.id,
            volumeName: volume.name,
            nodeId: volume.nodeId ?? "unscheduled",
            includes: volume.backup?.includes ?? [],
            excludes: volume.backup?.excludes ?? [],
            retention: volume.backup?.retention,
            destination: volume.backup?.destination,
            resolvedSecrets: {},
            status: "pending" as const
        };

        await BackupRunModel.create({
            id: payload.taskId,
            volumeId: volume.id,
            volumeName: volume.name,
            nodeId: payload.nodeId,
            status: "pending",
            payload,
            createdAt: now
        });
    }
}
