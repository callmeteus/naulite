import type { LogRotationPolicy, LogRotationTask } from "../types/LogRotationTask";

/**
 * Result metadata for a completed log rotation run.
 */
export interface LogRotationResult {
    rotatedFiles: string[];
    bytesFreed: number;
}

/**
 * Log rotation provider contract for policy evaluation and agent execution.
 */
export interface LogRotationProvider {
    /**
     * Evaluates whether a policy should run at the current time.
     * 
     * @param policy Log rotation policy
     * @param now Current evaluation timestamp
     * @returns Whether the policy is due
     */
    isDue(policy: LogRotationPolicy, now: Date): boolean;

    /**
     * Executes a log rotation task on the agent node.
     * 
     * @param task Log rotation task dispatched by the control plane
     * @returns Rotation result metadata
     */
    execute(task: LogRotationTask): Promise<LogRotationResult>;
}
