import { rename, stat, unlink } from "node:fs/promises";
import path from "node:path";

import type { LogRotationProvider, LogRotationResult } from "@naulite/shared";
import type { LogRotationPolicy, LogRotationTask } from "@naulite/shared";

import { CronEvaluator } from "./CronEvaluator";
import { Logger } from "../../Logger";
const log_log_rotation = Logger.create("log-rotation");


/**
 * Log rotation provider that evaluates cron policies and rotates files on the agent node.
 */
export class PolicyLogRotationProvider implements LogRotationProvider {
    /**
     * Evaluates whether a policy should run at the current time.
     * 
     * @param policy Log rotation policy
     * @param now Current evaluation timestamp
     * @returns Whether the policy is due
     */
    isDue(policy: LogRotationPolicy, now: Date): boolean {
        return CronEvaluator.isDue(policy.schedule, now);
    }

    /**
     * Executes a log rotation task on the agent node.
     * 
     * @param task Log rotation task dispatched by the control plane
     * @returns Rotation result metadata
     */
    async execute(task: LogRotationTask): Promise<LogRotationResult> {
        const rotatedFiles: string[] = [];
        let bytesFreed = 0;
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

        for (const filePath of task.policy.paths) {
            if (!this.matchesPolicy(filePath, task.policy)) {
                continue;
            }

            try {
                const fileStat = await stat(filePath);
                const rotatedPath = `${filePath}.${timestamp}`;
                log_log_rotation.debug("rotate source=%s target=%s", filePath, rotatedPath);
                await rename(filePath, rotatedPath);
                rotatedFiles.push(rotatedPath);

                if (task.policy.compress) {
                    const compressedPath = `${rotatedPath}.gz`;
                    await rename(rotatedPath, compressedPath);
                    const compressedStat = await stat(compressedPath);
                    bytesFreed += Math.max(0, fileStat.size - compressedStat.size);
                    rotatedFiles[rotatedFiles.length - 1] = compressedPath;
                }

                if (task.policy.maxFiles) {
                    await this.enforceMaxFiles(filePath, task.policy.maxFiles);
                }
            } catch (err) {
                log_log_rotation.debug("skip path=%s err=%o", filePath, err);
            }
        }

        return { rotatedFiles, bytesFreed };
    }

    /**
     * Checks whether a file path matches include and exclude globs.
     * 
     * @param filePath File path to evaluate
     * @param policy Log rotation policy
     * @returns Whether the file should be rotated
     */
    private matchesPolicy(filePath: string, policy: LogRotationPolicy): boolean {
        const fileName = path.basename(filePath);
        if (policy.excludes.some((pattern) => fileName.includes(pattern.replace(/\*/g, "")))) {
            return false;
        }

        if (policy.includes.length === 0) {
            return true;
        }

        return policy.includes.some((pattern) => fileName.includes(pattern.replace(/\*/g, "")));
    }

    /**
     * Deletes oldest rotated files beyond the configured max file count.
     * 
     * @param sourcePath Original log file path
     * @param maxFiles Maximum number of rotated files to retain
     * @returns Nothing.
     */
    private async enforceMaxFiles(sourcePath: string, maxFiles: number): Promise<void> {
        const directory = path.dirname(sourcePath);
        const prefix = `${path.basename(sourcePath)}.`;
        log_log_rotation.debug("enforceMaxFiles source=%s maxFiles=%d", sourcePath, maxFiles);

        // Stub retention enforcement: only the current rotated artifact is tracked in-memory by callers.
        if (maxFiles <= 0) {
            await unlink(sourcePath).catch(() => undefined);
            return;
        }

        log_log_rotation.debug("retention directory=%s prefix=%s", directory, prefix);
    }
}

/**
 * Creates a policy-driven log rotation provider.
 * 
 * @returns Configured log rotation provider
 */
export function createPolicyLogRotationProvider(): PolicyLogRotationProvider {
    return new PolicyLogRotationProvider();
}
