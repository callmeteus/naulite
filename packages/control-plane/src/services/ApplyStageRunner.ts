import type { Manifest, Task } from "@naulite/shared";

import { HTTP409Error } from "../errors/TreatedError";
import { TaskModuleRegistry } from "../orchestration/TaskModuleRegistry";
import type { HostExecutor } from "../runtime/HostExecutor";

import { PipelineRunService } from "./PipelineRunService";

/**
 * Pending task plan persisted while a gate pauses the run.
 */
export interface PendingTaskPlan {
    tasks: Task[];
    cursor: number;
    registers: Record<string, unknown>;
    vars: Record<string, string>;
}

/**
 * Executes manifest tasks (CI/CD playbook) with gates and rolling support.
 */
export namespace ApplyStageRunner {
    export interface RunOptions {
        runId: string;
        manifest: Manifest;
        executor: HostExecutor;
        vars?: Record<string, string>;
        createdBy?: string;
    }

    /**
     * Runs manifest tasks until completion or an approval gate.
     *
     * @param options Run options
     * @returns Final run status
     */
    export async function runTasks(options: RunOptions): Promise<"running" | "awaiting_approval" | "succeeded" | "failed"> {
        if (options.manifest.tasks.length === 0) {
            return "succeeded";
        }

        const plan: PendingTaskPlan = {
            tasks: options.manifest.tasks,
            cursor: 0,
            registers: {},
            vars: { ...options.manifest.vars, ...options.vars }
        };

        return executePlan(options.runId, plan, options.executor, options.createdBy);
    }

    /**
     * Continues a run paused at awaiting_approval.
     *
     * @param runId Pipeline run id
     * @param approvedBy Operator id
     * @param executor Host executor
     * @returns Updated status
     */
    export async function continueRun(
        runId: string,
        approvedBy: string,
        executor: HostExecutor
    ): Promise<"running" | "succeeded" | "failed"> {
        const run = await PipelineRunService.getRun(runId);

        if (!run) {
            throw new HTTP409Error("Pipeline run not found.");
        }

        if (run.status !== "awaiting_approval") {
            throw new HTTP409Error("Run is not awaiting approval.");
        }

        const plan = run.pendingPlan as PendingTaskPlan | undefined;

        if (!plan) {
            throw new HTTP409Error("Run has no pending plan.");
        }

        await PipelineRunService.updateRunFields(runId, {
            status: "running",
            approvedBy,
            gateStepId: null,
            pendingPlan: null
        });

        const outcome = await executePlan(runId, plan, executor, approvedBy);
        return outcome === "awaiting_approval" ? "running" : outcome;
    }

    /**
     * Aborts a running or gated pipeline run.
     *
     * @param runId Pipeline run id
     * @returns Nothing.
     */
    export async function abortRun(runId: string): Promise<void> {
        const run = await PipelineRunService.getRun(runId);

        if (!run) {
            throw new HTTP409Error("Pipeline run not found.");
        }

        if (run.status !== "awaiting_approval" && run.status !== "running") {
            throw new HTTP409Error("Run cannot be aborted in the current status.");
        }

        await PipelineRunService.completeRun(runId, "failed", {
            errorMessage: "Run aborted by operator."
        });
    }

    /**
     * Executes tasks from a pending plan cursor.
     *
     * @param runId Pipeline run id
     * @param plan Pending plan
     * @param executor Host executor
     * @param actor Operator or system actor
     * @returns Run status after execution
     */
    async function executePlan(
        runId: string,
        plan: PendingTaskPlan,
        executor: HostExecutor,
        actor?: string
    ): Promise<"running" | "awaiting_approval" | "succeeded" | "failed"> {
        for (let index = plan.cursor; index < plan.tasks.length; index += 1) {
            const task = plan.tasks[index];

            if (!evaluateWhen(task.when, plan.registers, plan.vars)) {
                plan.cursor = index + 1;
                continue;
            }

            TaskModuleRegistry.validateModuleFields(task);

            if (task.module === "confirm") {
                plan.cursor = index;
                await PipelineRunService.updateRunFields(runId, {
                    status: "awaiting_approval",
                    gateStepId: task.name,
                    pendingPlan: plan,
                    createdBy: actor
                });
                await PipelineRunService.emitEvent(runId, {
                    kind: "deploy.gate.awaiting",
                    message: task.prompt ?? task.name
                });
                return "awaiting_approval";
            }

            try {
                const nodeId = task.target ?? task.targetGroup ?? "local";
                const result = await executor.execute(nodeId, task, {
                    registers: plan.registers,
                    vars: plan.vars
                });

                if (task.register) {
                    plan.registers[task.register] = result;
                }
            } catch (err) {
                if (task.rescue && task.rescue.length > 0) {
                    plan.tasks.splice(index + 1, 0, ...task.rescue);
                } else if (!task.ignoreErrors) {
                    await PipelineRunService.completeRun(runId, "failed", {
                        errorMessage: err instanceof Error ? err.message : String(err)
                    });
                    return "failed";
                }
            }

            plan.cursor = index + 1;
        }

        await PipelineRunService.completeRun(runId, "succeeded", {});
        return "succeeded";
    }

    /**
     * Evaluates a simple `when` expression.
     *
     * @param when When expression
     * @param registers Task register bag
     * @param vars Manifest vars
     * @returns Whether the task should run
     */
    function evaluateWhen(
        when: string | undefined,
        registers: Record<string, unknown>,
        vars: Record<string, string>
    ): boolean {
        if (!when || when.trim() === "") {
            return true;
        }

        const trimmed = when.trim();

        if (trimmed.startsWith("not ")) {
            return !evaluateWhen(trimmed.slice(4), registers, vars);
        }

        if (trimmed.includes(".")) {
            const [register, field] = trimmed.split(".", 2);
            const raw = registers[register];
            const bag = isRegisterBag(raw) ? raw : undefined;
            const value = bag && field in bag ? bag[field] : undefined;

            if (typeof value === "boolean") {
                return value;
            }

            return Boolean(value);
        }

        if (trimmed in vars) {
            return vars[trimmed].trim() !== "";
        }

        return true;
    }

    /**
     * Narrows register values to object bags used by `when` field lookups.
     *
     * @param value Register entry
     * @returns Whether the value is a plain object bag
     */
    function isRegisterBag(value: unknown): value is Record<string, unknown> {
        return typeof value === "object" && value !== null && !Array.isArray(value);
    }
}
