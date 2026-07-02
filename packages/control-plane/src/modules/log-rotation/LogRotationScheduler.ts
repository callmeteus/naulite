import { randomUUID } from "node:crypto";

import type { Instance, Service } from "@platform/shared";

import { InstanceModel, LogRotationRunModel, ServiceModel } from "../../database/models/index";
import { RowMapper } from "../../util/RowMapper";

/**
 * Cron-like log rotation scheduler for service policies.
 */
export class LogRotationScheduler {
    private intervalHandle: NodeJS.Timeout | null = null;

    /**
     * Creates a log rotation scheduler.
     *
     * @param pollIntervalMs Poll interval in milliseconds
     */
    constructor(private readonly pollIntervalMs: number = 60_000) {}

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
        const services = await ServiceModel.findAll();
        const instances = await InstanceModel.findAll();

        for (const serviceRow of services) {
            const service = RowMapper.service(serviceRow.get({ plain: true }));

            if (!service.logRotation) {
                continue;
            }

            const serviceInstances = instances
                .map((row) => RowMapper.instance(row.get({ plain: true })))
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

        await LogRotationRunModel.create({
            id: payload.taskId,
            instanceId: instance.id,
            serviceName: service.name,
            nodeId: instance.nodeId,
            status: "pending",
            payload,
            rotatedFiles: [],
            createdAt: now
        });
    }
}
