import { randomUUID } from "node:crypto";

import type { Instance, Service } from "@platform/shared";

import type { DatabaseProvider } from "../database/DatabaseProvider.js";
import { postgresSchema } from "../database/schema.pg.js";
import { sqliteSchema } from "../database/schema.sqlite.js";

/**
 * Cron-like log rotation scheduler for service policies.
 */
export class LogRotationScheduler {
    private intervalHandle: NodeJS.Timeout | null = null;

    /**
     * Creates a log rotation scheduler.
     * 
     * @param databaseProvider Connected database provider
     * @param pollIntervalMs Poll interval in milliseconds
     */
    constructor(
        private readonly databaseProvider: DatabaseProvider,
        private readonly pollIntervalMs: number = 60_000
    ) {}

    /**
     * Starts polling services and instances with log rotation policies.
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
     * Stops the log rotation scheduler loop.
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
     * Evaluates log rotation policies and enqueues rotation runs.
     * 
     * @returns Nothing.
     */
    async tick(): Promise<void> {
        const services = this.databaseProvider.getDialect() === "postgresql"
            ? await this.databaseProvider.getPgDb().select().from(postgresSchema.services)
            : await this.databaseProvider.getSqliteDb().select().from(sqliteSchema.services);
        const instances = this.databaseProvider.getDialect() === "postgresql"
            ? await this.databaseProvider.getPgDb().select().from(postgresSchema.instances)
            : await this.databaseProvider.getSqliteDb().select().from(sqliteSchema.instances);

        for (const serviceRow of services) {
            const service = LogRotationScheduler.mapServiceRow(serviceRow);

            if (!service.logRotation) {
                continue;
            }

            const serviceInstances = instances
                .map((row) => LogRotationScheduler.mapInstanceRow(row))
                .filter((instance) => instance.serviceId === service.id);

            for (const instance of serviceInstances) {
                await this.enqueueRotationRun(service, instance);
            }
        }
    }

    /**
     * Enqueues a log rotation run for an instance.
     * 
     * @param service Service owning the rotation policy
     * @param instance Target instance
     * @returns Nothing.
     */
    private async enqueueRotationRun(service: Service, instance: Instance): Promise<void> {
        const now = new Date().toISOString();
        const payload = {
            taskId: randomUUID(),
            instanceId: instance.id,
            serviceName: service.name,
            nodeId: instance.nodeId,
            policy: service.logRotation!,
            status: "pending" as const,
            rotatedFiles: [] as string[]
        };

        if (this.databaseProvider.getDialect() === "postgresql") {
            await this.databaseProvider.getPgDb().insert(postgresSchema.logRotationRuns).values({
                id: payload.taskId,
                instanceId: instance.id,
                serviceName: service.name,
                nodeId: instance.nodeId,
                status: "pending",
                payload,
                rotatedFiles: [],
                createdAt: now
            });
        } else {
            await this.databaseProvider.getSqliteDb().insert(sqliteSchema.logRotationRuns).values({
                id: payload.taskId,
                instanceId: instance.id,
                serviceName: service.name,
                nodeId: instance.nodeId,
                status: "pending",
                payload: JSON.stringify(payload),
                rotatedFiles: JSON.stringify([]),
                createdAt: now
            });
        }
    }

    /**
     * Maps a database row into a service model.
     * 
     * @param row Database row
     * @returns Service model
     */
    private static mapServiceRow(row: {
        id: string;
        name: string;
        manifestName: string;
        image: string;
        desiredReplicas: number;
        status: string;
        cluster: unknown;
        capabilities: unknown;
        networks: unknown;
        ingress: unknown;
        logRotation: unknown;
        lifecycleStatus: string | null;
        createdAt: string;
        updatedAt: string;
    }): Service {
        return {
            id: row.id,
            name: row.name,
            manifestName: row.manifestName,
            image: row.image,
            desiredReplicas: row.desiredReplicas,
            status: row.status as Service["status"],
            cluster: LogRotationScheduler.parseJson(row.cluster) as Service["cluster"],
            capabilities: LogRotationScheduler.parseJson(row.capabilities) as string[],
            networks: LogRotationScheduler.parseJson(row.networks) as string[],
            ingress: LogRotationScheduler.parseJson(row.ingress) as Service["ingress"],
            logRotation: LogRotationScheduler.parseJson(row.logRotation) as Service["logRotation"],
            lifecycleStatus: row.lifecycleStatus as Service["lifecycleStatus"],
            createdAt: row.createdAt,
            updatedAt: row.updatedAt
        };
    }

    /**
     * Maps a database row into an instance model.
     * 
     * @param row Database row
     * @returns Instance model
     */
    private static mapInstanceRow(row: {
        id: string;
        serviceId: string;
        serviceName: string;
        nodeId: string;
        status: string;
        containerId: string | null;
        image: string;
        resources: unknown;
        health: unknown;
        lifecycleStatus: string | null;
        createdAt: string;
        updatedAt: string;
    }): Instance {
        return {
            id: row.id,
            serviceId: row.serviceId,
            serviceName: row.serviceName,
            nodeId: row.nodeId,
            status: row.status as Instance["status"],
            containerId: row.containerId ?? undefined,
            image: row.image,
            resources: LogRotationScheduler.parseJson(row.resources) as Instance["resources"],
            health: LogRotationScheduler.parseJson(row.health) as Instance["health"],
            lifecycleStatus: row.lifecycleStatus as Instance["lifecycleStatus"],
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
