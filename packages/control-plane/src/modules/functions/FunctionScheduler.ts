import type { Service } from "@naulite/shared";

import { Logger } from "../../Logger";
import { ServiceModel } from "../../database/models/index";
import { FunctionInvokeService } from "../../services/FunctionInvokeService";
import { RowMapper } from "../../util/RowMapper";
import { CronEvaluator } from "../log-rotation/CronEvaluator";
const logFunctions = Logger.create("functions");

export interface FunctionSchedulerOptions {
    /**
     * Returns whether this control plane replica may dispatch cron invocations.
     */
    isLeader?: () => boolean;
}

/**
 * Leader-gated cron dispatcher for manifest-declared server functions.
 */
export class FunctionScheduler {
    private intervalHandle: NodeJS.Timeout | null = null;
    private readonly isLeader: () => boolean;
    private readonly lastDispatchedByService = new Map<string, string>();

    constructor(
        private readonly pollIntervalMs: number = 60_000,
        options: FunctionSchedulerOptions = {}
    ) {
        this.isLeader = options.isLeader ?? (() => true);
    }

    /**
     * Starts the polling loop that evaluates cron triggers once per minute.
     */
    start(): void {
        if (this.intervalHandle) {
            return;
        }

        this.intervalHandle = setInterval(() => {
            void this.tick().catch((err) => {
                logFunctions.debug("scheduler tick failed err=%o", err);
            });
        }, this.pollIntervalMs);
    }

    stop(): void {
        if (this.intervalHandle) {
            clearInterval(this.intervalHandle);
            this.intervalHandle = null;
        }
    }

    /**
     * Evaluates due cron triggers and invokes matching function services.
     */
    async tick(): Promise<void> {
        if (!this.isLeader()) {
            logFunctions.debug("scheduler tick skipped reason=not-leader");
            return;
        }

        const now = new Date();
        const minuteKey = now.toISOString().slice(0, 16);
        const rows = await ServiceModel.findAll();

        for (const row of rows) {
            const service = RowMapper.service(row.get({ plain: true })) as Service;
            const cron = service.functionSpec?.trigger?.cron;

            if (!cron) {
                continue;
            }

            if (!CronEvaluator.isDue(cron, now)) {
                continue;
            }

            const last = this.lastDispatchedByService.get(service.id);

            if (last === minuteKey) {
                continue;
            }

            this.lastDispatchedByService.set(service.id, minuteKey);
            logFunctions.debug("cron due service=%s schedule=%s", service.name, cron);
            await FunctionInvokeService.invoke(service.name, { source: "cron" });
        }
    }
}

