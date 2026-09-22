import { Logger } from "../Logger";
import { CronEvaluator } from "../modules/log-rotation/CronEvaluator";

import { ControlPlaneService } from "../ControlPlaneService";
import { SandboxTemplateService } from "./SandboxTemplateService";

const logSandboxBake = Logger.create("sandbox-bake");

export interface SandboxBakeSchedulerOptions {
    /**
     * Returns whether this control plane replica may trigger scheduled bakes.
     */
    isLeader?: () => boolean;
}

/**
 * Leader-gated cron dispatcher for sandbox template nightly bakes.
 */
export class SandboxBakeScheduler {
    private intervalHandle: NodeJS.Timeout | null = null;
    private readonly isLeader: () => boolean;
    private readonly lastDispatchedByTemplate = new Map<string, string>();

    constructor(
        private readonly pollIntervalMs: number = 60_000,
        options: SandboxBakeSchedulerOptions = {}
    ) {
        this.isLeader = options.isLeader ?? (() => true);
    }

    /**
     * Starts the polling loop that evaluates bake cron once per minute.
     */
    start(): void {
        if (this.intervalHandle) {
            return;
        }

        this.intervalHandle = setInterval(() => {
            void this.tick().catch((err) => {
                logSandboxBake.error("scheduler tick failed: %O", err);
            });
        }, this.pollIntervalMs);
    }

    /**
     * Stops the polling loop.
     */
    stop(): void {
        if (this.intervalHandle) {
            clearInterval(this.intervalHandle);
            this.intervalHandle = null;
        }
    }

    /**
     * Evaluates due bake cron schedules and triggers template bakes.
     */
    async tick(): Promise<void> {
        if (!this.isLeader()) {
            logSandboxBake.debug("scheduler tick skipped reason=not-leader");
            return;
        }

        const now = new Date();
        const minuteKey = now.toISOString().slice(0, 16);
        const page = await ControlPlaneService.Store.listSandboxTemplates({ page: 1, limit: 200 });

        for (const template of page.items) {
            const cron = template.bakeCron;

            if (!cron || cron.trim() === "") {
                continue;
            }

            if (!CronEvaluator.isDue(cron, now)) {
                continue;
            }

            const last = this.lastDispatchedByTemplate.get(template.id);

            if (last === minuteKey) {
                continue;
            }

            this.lastDispatchedByTemplate.set(template.id, minuteKey);
            logSandboxBake.debug("bake cron due template=%s schedule=%s", template.id, cron);
            await SandboxTemplateService.triggerBake(template.id);
        }
    }
}
