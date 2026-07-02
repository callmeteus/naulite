import { randomUUID } from "node:crypto";

import type { Volume } from "@platform/shared";

import type { DatabaseProvider } from "../database/DatabaseProvider.js";
import { postgresSchema } from "../database/schema.pg.js";
import { sqliteSchema } from "../database/schema.sqlite.js";

/**
 * Cron-like backup scheduler for volume backup policies.
 */
export class BackupScheduler {
    private intervalHandle: NodeJS.Timeout | null = null;

    /**
     * Creates a backup scheduler.
     * 
     * @param databaseProvider Connected database provider
     * @param pollIntervalMs Poll interval in milliseconds
     */
    constructor(
        private readonly databaseProvider: DatabaseProvider,
        private readonly pollIntervalMs: number = 60_000
    ) {}

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
        if (this.databaseProvider.getDialect() === "postgresql") {
            const rows = await this.databaseProvider.getPgDb().select().from(postgresSchema.volumes);

            for (const row of rows) {
                const volume = BackupScheduler.mapVolumeRow(row);

                if (!volume.backup) {
                    continue;
                }

                await this.enqueueBackupRun(volume);
            }

            return;
        }

        const rows = await this.databaseProvider.getSqliteDb().select().from(sqliteSchema.volumes);

        for (const row of rows) {
            const volume = BackupScheduler.mapVolumeRow(row);

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

        if (this.databaseProvider.getDialect() === "postgresql") {
            await this.databaseProvider.getPgDb().insert(postgresSchema.backupRuns).values({
                id: payload.taskId,
                volumeId: volume.id,
                volumeName: volume.name,
                nodeId: payload.nodeId,
                status: "pending",
                payload,
                createdAt: now
            });
        } else {
            await this.databaseProvider.getSqliteDb().insert(sqliteSchema.backupRuns).values({
                id: payload.taskId,
                volumeId: volume.id,
                volumeName: volume.name,
                nodeId: payload.nodeId,
                status: "pending",
                payload: JSON.stringify(payload),
                createdAt: now
            });
        }
    }

    /**
     * Maps a database row into a volume model.
     * 
     * @param row Database row
     * @returns Volume model
     */
    private static mapVolumeRow(row: {
        id: string;
        name: string;
        manifestName: string;
        scope: string;
        nodeId: string | null;
        mountPath: string;
        sizeMb: number | null;
        status: string;
        backup: unknown;
        createdAt: string;
        updatedAt: string;
    }): Volume {
        return {
            id: row.id,
            name: row.name,
            manifestName: row.manifestName,
            scope: row.scope as Volume["scope"],
            nodeId: row.nodeId ?? undefined,
            mountPath: row.mountPath,
            sizeMb: row.sizeMb ?? undefined,
            status: row.status as Volume["status"],
            backup: BackupScheduler.parseJson(row.backup) as Volume["backup"],
            createdAt: row.createdAt,
            updatedAt: row.updatedAt
        };
    }

    /**
     * Parses JSON values from sqlite text columns.
     * 
     * @param value Raw JSON value
     * @returns Parsed value
     */
    private static parseJson(value: unknown): unknown {
        if (typeof value === "string") {
            return JSON.parse(value);
        }

        return value;
    }
}
