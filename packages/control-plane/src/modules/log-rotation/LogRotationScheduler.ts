import { randomUUID } from "node:crypto";

import { Op } from "sequelize";

import type { Instance, Service } from "@platform/shared";

import { InstanceModel, LogRotationRunModel, NodeModel, ServiceModel } from "../../database/models/index";
import { AgentProxyService } from "../../services/AgentProxyService";
import { RowMapper } from "../../util/RowMapper";
import { CronEvaluator } from "./CronEvaluator";

/**
 * Dispatches a JSON task payload to a node agent.
 */
export type SchedulerDispatchFn = (
    agentUrl: string,
    path: string,
    payload: unknown
) => Promise<unknown>;

/**
 * Optional log rotation scheduler dependencies.
 */
export interface LogRotationSchedulerOptions {
    isLeader?: () => boolean;
}

/**
 * Cron-like log rotation scheduler for service policies.
 */
export class LogRotationScheduler {
    private intervalHandle: NodeJS.Timeout | null = null;
    private readonly isLeader: () => boolean;

    /**
     * Creates a log rotation scheduler.
     *
     * @param pollIntervalMs Poll interval in milliseconds
     * @param dispatchTask Agent task dispatcher used during ticks
     * @param options Optional leader gate callback
     */
    constructor(
        private readonly pollIntervalMs: number = 60_000,
        private readonly dispatchTask: SchedulerDispatchFn = AgentProxyService.postTask,
        options: LogRotationSchedulerOptions = {}
    ) {
        this.isLeader = options.isLeader ?? (() => true);
    }

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
            void this.tick().catch((err) => {
                console.debug("[log-rotation] scheduler tick failed err=%o", err);
            });
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
        if (!this.isLeader()) {
            console.debug("[log-rotation] scheduler tick skipped reason=not-leader");
            return;
        }

        const now = new Date();
        const services = await ServiceModel.findAll();
        const instances = await InstanceModel.findAll();

        for (const serviceRow of services) {
            const service = RowMapper.service(serviceRow.get({ plain: true }));

            if (!service.logRotation) {
                continue;
            }

            if (!CronEvaluator.isDue(service.logRotation.schedule, now)) {
                continue;
            }

            const serviceInstances = instances
                .map((row) => RowMapper.instance(row.get({ plain: true })))
                .filter((instance) => instance.serviceId === service.id);

            for (const instance of serviceInstances) {
                if (await this.hasRecentRun(instance.id, now)) {
                    console.debug("[log-rotation] skip recent run instance=%s", instance.id);
                    continue;
                }

                await this.enqueueRotationRun(service, instance, now);
            }
        }
    }

    /**
     * Enqueues a log rotation run for an instance.
     *
     * @param service Service owning the rotation policy
     * @param instance Target instance
     * @param now Current evaluation timestamp
     * @returns Nothing.
     */
    private async enqueueRotationRun(service: Service, instance: Instance, now: Date): Promise<void> {
        const node = await this.resolveNode(instance.nodeId);
        if (!node?.agentUrl) {
            console.debug("[log-rotation] skip dispatch service=%s instance=%s reason=no-agent", service.name, instance.id);
            return;
        }

        const taskId = randomUUID();
        const createdAt = now.toISOString();
        const payload = {
            taskId,
            instanceId: instance.id,
            serviceName: service.name,
            nodeId: instance.nodeId,
            policy: service.logRotation!,
            status: "pending" as const,
            rotatedFiles: [] as string[]
        };

        await LogRotationRunModel.create({
            id: taskId,
            instanceId: instance.id,
            serviceName: service.name,
            nodeId: instance.nodeId,
            status: "pending",
            payload,
            rotatedFiles: [],
            createdAt
        });

        try {
            await this.dispatchTask(node.agentUrl, "/tasks/log-rotation", {
                taskId,
                instanceId: instance.id,
                serviceName: service.name,
                policy: service.logRotation
            });

            await LogRotationRunModel.update(
                { status: "running", startedAt: createdAt },
                { where: { id: taskId } }
            );

            console.debug(
                "[log-rotation] dispatched taskId=%s service=%s instance=%s node=%s",
                taskId,
                service.name,
                instance.id,
                node.id
            );
        } catch (err) {
            await LogRotationRunModel.update(
                {
                    status: "failed",
                    errorMessage: err instanceof Error ? err.message : String(err),
                    completedAt: createdAt
                },
                { where: { id: taskId } }
            );
            console.debug(
                "[log-rotation] dispatch failed taskId=%s service=%s err=%o",
                taskId,
                service.name,
                err
            );
        }
    }

    /**
     * Returns whether a rotation run already exists for the current cron minute.
     *
     * @param instanceId Instance identifier
     * @param now Current evaluation timestamp
     * @returns Whether a recent run exists
     */
    private async hasRecentRun(instanceId: string, now: Date): Promise<boolean> {
        const minuteStart = new Date(Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate(),
            now.getUTCHours(),
            now.getUTCMinutes(),
            0,
            0
        ));

        const count = await LogRotationRunModel.count({
            where: {
                instanceId,
                createdAt: {
                    [Op.gte]: minuteStart.toISOString()
                }
            }
        });

        return count > 0;
    }

    /**
     * Resolves the node running an instance.
     *
     * @param nodeId Node identifier from the instance
     * @returns Node row when available
     */
    private async resolveNode(nodeId: string) {
        const node = await NodeModel.findByPk(nodeId);
        return node ? RowMapper.node(node.get({ plain: true })) : undefined;
    }
}
