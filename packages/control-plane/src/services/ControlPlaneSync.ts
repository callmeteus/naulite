import { randomUUID } from "node:crypto";
import { Op } from "sequelize";

import type { DatabaseProvider } from "../database/DatabaseProvider.js";
import { ControlPlaneEventModel } from "../database/models/index.js";

/**
 * Control plane sync event payload.
 */
export interface ControlPlaneSyncEvent {
    id: number;
    eventType: string;
    payload: Record<string, unknown>;
    sourceInstanceId: string;
    createdAt: string;
}

/**
 * Multi control-plane synchronization via PostgreSQL events.
 */
export class ControlPlaneSync {
    private pollHandle: NodeJS.Timeout | null = null;
    private lastEventId = 0;
    private readonly listeners = new Map<string, Set<(event: ControlPlaneSyncEvent) => void>>();

    /**
     * Creates a control plane sync service.
     *
     * @param databaseProvider Connected database provider
     * @param instanceId Unique control plane instance id
     * @param pollIntervalMs Poll interval in milliseconds
     */
    constructor(
        private readonly databaseProvider: DatabaseProvider,
        private readonly instanceId: string = randomUUID(),
        private readonly pollIntervalMs: number = 2_000
    ) {}

    /**
     * Starts polling PostgreSQL events when the dialect supports sync.
     *
     * @returns Nothing.
     */
    start(): void {
        if (this.databaseProvider.getDialect() !== "postgresql" || this.pollHandle) {
            return;
        }

        this.pollHandle = setInterval(() => {
            void this.poll().catch(() => undefined);
        }, this.pollIntervalMs);
    }

    /**
     * Stops polling PostgreSQL events.
     *
     * @returns Nothing.
     */
    stop(): void {
        if (this.pollHandle) {
            clearInterval(this.pollHandle);
            this.pollHandle = null;
        }
    }

    /**
     * Publishes a sync event to PostgreSQL.
     *
     * @param eventType Event type identifier
     * @param payload Event payload
     * @returns Published event
     */
    async publish(eventType: string, payload: Record<string, unknown>): Promise<ControlPlaneSyncEvent | null> {
        if (this.databaseProvider.getDialect() !== "postgresql") {
            return null;
        }

        const createdAt = new Date().toISOString();
        const row = await ControlPlaneEventModel.create({
            eventType,
            payload,
            sourceInstanceId: this.instanceId,
            createdAt
        });

        return {
            id: row.id,
            eventType: row.eventType,
            payload: row.payload,
            sourceInstanceId: row.sourceInstanceId,
            createdAt: row.createdAt
        };
    }

    /**
     * Subscribes to sync events by type.
     *
     * @param eventType Event type identifier
     * @param listener Event listener callback
     * @returns Nothing.
     */
    on(eventType: string, listener: (event: ControlPlaneSyncEvent) => void): void {
        const listeners = this.listeners.get(eventType) ?? new Set();
        listeners.add(listener);
        this.listeners.set(eventType, listeners);
    }

    /**
     * Polls for new PostgreSQL sync events.
     *
     * @returns Nothing.
     */
    async poll(): Promise<void> {
        if (this.databaseProvider.getDialect() !== "postgresql") {
            return;
        }

        const rows = await ControlPlaneEventModel.findAll({
            where: {
                id: { [Op.gt]: this.lastEventId }
            },
            order: [["id", "ASC"]]
        });

        for (const row of rows) {
            if (row.sourceInstanceId === this.instanceId) {
                this.lastEventId = Math.max(this.lastEventId, row.id);
                continue;
            }

            const event: ControlPlaneSyncEvent = {
                id: row.id,
                eventType: row.eventType,
                payload: row.payload,
                sourceInstanceId: row.sourceInstanceId,
                createdAt: row.createdAt
            };
            this.lastEventId = Math.max(this.lastEventId, row.id);
            const listeners = this.listeners.get(event.eventType);

            if (listeners) {
                for (const listener of listeners) {
                    listener(event);
                }
            }
        }
    }
}
