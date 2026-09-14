import type { Task } from "@naulite/shared";

/**
 * Recorded host executor invocation (tests and audit).
 */
export interface HostExecutorCall {
    kind: string;
    nodeId: string;
    task: Task;
    payload: Record<string, unknown>;
}

/**
 * Result of executing a single task module on a host.
 */
export interface HostExecutorResult {
    changed?: boolean;
    confirmed?: boolean;
    failed?: boolean;
    rc?: number;
    stdout?: string;
    exists?: boolean;
    isdir?: boolean;
    mode?: string;
}

/**
 * Executes playbook modules on a host (SSH, Warpgate, or agent).
 */
export interface HostExecutor {
    /**
     * Runs a task module against a destination node.
     *
     * @param nodeId Target node id
     * @param task Task definition
     * @param context Execution context (vars, register values)
     * @returns Module result registers
     */
    execute(nodeId: string, task: Task, context: Record<string, unknown>): Promise<HostExecutorResult>;

    /**
     * Returns recorded calls when the executor is instrumented.
     *
     * @returns Invocation log
     */
    getCalls?(): HostExecutorCall[];
}
