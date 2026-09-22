import { randomUUID } from "node:crypto";

import type { Node, SandboxInstance, SandboxTemplate, Task } from "@naulite/shared";

import { ControlPlaneService } from "../ControlPlaneService";
import { Logger } from "../Logger";
import { TargetGroupService } from "./TargetGroupService";
import { AgentProxyService } from "./AgentProxyService";
import { PipelineRunService } from "./PipelineRunService";

const logSandbox = Logger.create("sandbox");

/**
 * Execution context passed from ApplyStageRunner into sandbox builds.
 */
export interface SandboxBuildContext {
    runId?: string;
    registers?: Record<string, unknown>;
    vars?: Record<string, string>;
}

/**
 * Result returned to playbook registers after a sandbox build.
 */
export interface SandboxBuildResult {
    changed: boolean;
    rc: number;
    stdout: string;
    sandboxInstance: string;
    outputPaths: string[];
}

/**
 * Clone / exec / collect / destroy orchestration for Incus sandboxes.
 */
export namespace SandboxService {
    /**
     * Reads the Incus pool driver reported by the agent on node labels.
     *
     * @param node Cluster node
     * @returns Pool driver when present
     */
    export function readIncusPoolDriver(node: Node): string | undefined {
        const raw = node.labels["incusPoolDriver"];

        if (typeof raw !== "string") {
            return undefined;
        }

        return raw;
    }

    /**
     * Returns whether the node may run sandbox workloads (CoW pool required).
     *
     * @param node Cluster node
     * @returns True when sandbox capability and zfs/btrfs pool are present
     */
    export function isCowSandboxNode(node: Node): boolean {
        if (!node.capabilities.includes("sandbox")) {
            return false;
        }

        const driver = readIncusPoolDriver(node);

        return driver === "zfs" || driver === "btrfs";
    }

    /**
     * Executes a build task inside an Incus sandbox clone.
     *
     * @param nodeId Task target, hostname, or target group id
     * @param task Build task with sandbox config
     * @param context Run context (runId for instance naming)
     * @returns Build result for task registers
     */
    export async function executeBuild(
        nodeId: string,
        task: Task,
        context: SandboxBuildContext
    ): Promise<SandboxBuildResult> {
        if (task.module !== "build" || !task.sandbox) {
            throw new Error("executeBuild requires a build task with sandbox.");
        }

        const template = await ControlPlaneService.Store.getSandboxTemplate(task.sandbox.parent);

        if (!template) {
            throw new Error(`Sandbox template ${task.sandbox.parent} was not found.`);
        }

        const node = await resolveSandboxNode(nodeId, template);
        const agentUrl = node.agentUrl;

        if (!agentUrl) {
            throw new Error(`Node ${node.id} does not expose an agent URL.`);
        }

        const runId = context.runId ?? randomUUID();
        const incusName = sanitizeIncusName(`build-${runId}`);
        let instanceRow: SandboxInstance | null = null;
        let acquiredWarm = false;

        try {
            const warm = await ControlPlaneService.Store.findIdleWarmSandboxInstance(template.id);

            if (warm) {
                instanceRow = {
                    ...warm,
                    runId,
                    kind: "job",
                    status: "running"
                };
                acquiredWarm = true;
                await ControlPlaneService.Store.saveSandboxInstance(instanceRow);
            } else {
                instanceRow = createInstanceRow(template, runId, incusName, "job", "cloning");
                await ControlPlaneService.Store.saveSandboxInstance(instanceRow);

                await AgentProxyService.postTask(agentUrl, "/tasks/sandbox/clone", {
                    parent: template.incusName,
                    snapshot: template.snapshot,
                    modulesVolume: template.modulesVolume,
                    instance: incusName
                });
            }

            const activeName = acquiredWarm ? instanceRow.incusName : incusName;

            if (context.runId) {
                await PipelineRunService.emitEvent(context.runId, {
                    kind: "deploy.step.started",
                    message: `sandbox:${activeName}`
                });
            }

            if (task.sandbox.checkout) {
                await runCheckout(agentUrl, activeName, task, context);
            }

            const argv = normalizeCommand(task.command);
            const workdir = task.sandbox.workdir ?? task.chdir ?? "/workspace";

            const execResult = await AgentProxyService.postTask(agentUrl, "/tasks/sandbox/exec", {
                instance: activeName,
                command: argv,
                workdir,
                env: task.env
            });

            if (readExecFailed(execResult)) {
                const detail = readExecStderr(execResult) || readStdout(execResult) || "sandbox exec failed";
                throw new Error(detail.trim());
            }

            const stdout = readStdout(execResult);

            if (instanceRow) {
                instanceRow = {
                    ...instanceRow,
                    status: "collecting"
                };
                await ControlPlaneService.Store.saveSandboxInstance(instanceRow);
            }

            const collectResult = await AgentProxyService.postTask(agentUrl, "/tasks/sandbox/collect", {
                instance: activeName,
                workdir,
                outputs: task.outputs ?? []
            });

            const outputPaths = readOutputPaths(collectResult);

            return {
                changed: true,
                rc: 0,
                stdout,
                sandboxInstance: activeName,
                outputPaths
            };
        } finally {
            const destroyName = instanceRow?.incusName ?? incusName;

            try {
                await AgentProxyService.deleteTask(agentUrl, `/tasks/sandbox/${encodeURIComponent(destroyName)}`);
            } catch (err) {
                logSandbox.error("sandbox destroy failed: %O", err);
            }

            if (instanceRow) {
                await ControlPlaneService.Store.saveSandboxInstance({
                    ...instanceRow,
                    status: "destroyed",
                    destroyedAt: new Date().toISOString()
                });
            }

            await replenishWarmPool(template, node);
        }
    }

    /**
     * Ensures warm pool clones exist up to the configured size.
     *
     * @param template Sandbox template
     * @param node Host node for Incus operations
     * @returns Nothing.
     */
    export async function replenishWarmPool(template: SandboxTemplate, node: Node): Promise<void> {
        if (template.warmPoolSize <= 0 || !node.agentUrl) {
            return;
        }

        const existing = await ControlPlaneService.Store.listSandboxInstances(template.id);
        const idleWarm = existing.filter((row) => {
            return row.kind === "warm" && row.status === "idle";
        }).length;

        for (let index = idleWarm; index < template.warmPoolSize; index += 1) {
            const warmName = sanitizeIncusName(`warm-${template.id}-${randomUUID()}`);
            const row = createInstanceRow(template, null, warmName, "warm", "cloning");
            await ControlPlaneService.Store.saveSandboxInstance(row);

            await AgentProxyService.postTask(node.agentUrl, "/tasks/sandbox/clone", {
                parent: template.incusName,
                snapshot: template.snapshot,
                modulesVolume: template.modulesVolume,
                instance: warmName,
                start: false
            });

            await ControlPlaneService.Store.saveSandboxInstance({
                ...row,
                status: "idle"
            });
        }
    }

    /**
     * Resolves the node that hosts the sandbox template.
     *
     * @param nodeId Task placement target
     * @param template Sandbox template
     * @returns Online sandbox-capable node
     */
    async function resolveSandboxNode(nodeId: string, template: SandboxTemplate): Promise<Node> {
        const pinned = await ControlPlaneService.Store.getNode(template.nodeId);

        if (pinned && isCowSandboxNode(pinned)) {
            return pinned;
        }

        const byTarget = await resolveNodeByTarget(nodeId);

        if (byTarget && isCowSandboxNode(byTarget)) {
            return byTarget;
        }

        throw new Error(`No sandbox-capable node with CoW storage found for ${nodeId}.`);
    }

    /**
     * Resolves a node from target, hostname, or target group membership.
     *
     * @param nodeId Placement target
     * @returns First sandbox-capable member when found
     */
    async function resolveNodeByTarget(nodeId: string): Promise<Node | null> {
        const direct = await ControlPlaneService.Store.getNode(nodeId);

        if (direct) {
            return direct;
        }

        const byHostname = await ControlPlaneService.Store.getNodeByHostname(nodeId);

        if (byHostname) {
            return byHostname;
        }

        try {
            const group = await TargetGroupService.get(nodeId);
            const nodes = await ControlPlaneService.Store.listNodes();

            for (const memberId of group.memberNodeIds) {
                const member = nodes.find((node) => node.id === memberId);

                if (member && isCowSandboxNode(member)) {
                    return member;
                }
            }
        } catch {
            return null;
        }

        return null;
    }

    /**
     * Creates a persisted sandbox instance row before Incus clone.
     *
     * @param template Parent template
     * @param runId Pipeline run id when job clone
     * @param incusName Incus instance name
     * @param kind Clone kind
     * @param status Initial status
     * @returns Unsaved instance payload
     */
    function createInstanceRow(
        template: SandboxTemplate,
        runId: string | null,
        incusName: string,
        kind: SandboxInstance["kind"],
        status: SandboxInstance["status"]
    ): SandboxInstance {
        const now = new Date().toISOString();

        return {
            id: randomUUID(),
            parentId: template.id,
            runId,
            incusName,
            kind,
            status,
            createdAt: now,
            destroyedAt: null
        };
    }

    /**
     * Runs git checkout commands inside the clone when configured.
     *
     * @param agentUrl Node agent base URL
     * @param incusName Clone name
     * @param task Build task
     * @param context Run vars
     * @returns Nothing.
     */
    async function runCheckout(
        agentUrl: string,
        incusName: string,
        task: Task,
        context: SandboxBuildContext
    ): Promise<void> {
        const checkout = task.sandbox?.checkout;

        if (!checkout) {
            return;
        }

        const branch = interpolate(checkout.branch, context.vars);
        const workdir = task.sandbox?.workdir ?? "/workspace";
        const argv = ["lm", "git", "change-branch", checkout.root];

        if (branch) {
            argv.push(branch);
        }

        await AgentProxyService.postTask(agentUrl, "/tasks/sandbox/exec", {
            instance: incusName,
            command: argv,
            workdir
        });
    }

    /**
     * Normalizes build command argv.
     *
     * @param command Task command
     * @returns Argv array
     */
    function normalizeCommand(command: Task["command"]): string[] {
        if (Array.isArray(command)) {
            return command;
        }

        if (typeof command === "string" && command.trim() !== "") {
            return ["sh", "-c", command];
        }

        throw new Error("build command must not be empty.");
    }

    /**
     * Sanitizes a string for Incus instance names.
     *
     * @param value Raw name
     * @returns Incus-safe name
     */
    function sanitizeIncusName(value: string): string {
        return value.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 63);
    }

    /**
     * Interpolates ${VAR} placeholders using run vars.
     *
     * @param input Template string
     * @param vars Run variables
     * @returns Interpolated string or undefined
     */
    function interpolate(input: string | undefined, vars?: Record<string, string>): string | undefined {
        if (!input) {
            return undefined;
        }

        return input.replace(/\$\{([^}]+)\}/g, (_match, key: string) => {
            return vars?.[key] ?? "";
        });
    }

    /**
     * Returns whether an agent exec response indicates failure.
     *
     * @param value Agent JSON body
     * @returns True when rc is non-zero or failed flag is set
     */
    function readExecFailed(value: unknown): boolean {
        if (!isAgentJsonRecord(value)) {
            return true;
        }

        const failed = value.failed;

        if (failed === true) {
            return true;
        }

        const rc = value.rc;

        if (typeof rc === "number" && rc !== 0) {
            return true;
        }

        return false;
    }

    /**
     * Reads stderr from an agent exec response.
     *
     * @param value Agent JSON body
     * @returns Stderr text
     */
    function readExecStderr(value: unknown): string {
        if (!isAgentJsonRecord(value)) {
            return "";
        }

        const stderr = value.stderr;

        if (typeof stderr === "string") {
            return stderr;
        }

        return "";
    }

    /**
     * Reads stdout from an agent exec response.
     *
     * @param value Agent JSON body
     * @returns Stdout text
     */
    function readStdout(value: unknown): string {
        if (!isAgentJsonRecord(value)) {
            return "";
        }

        const stdout = value.stdout;

        if (typeof stdout === "string") {
            return stdout;
        }

        return "";
    }

    /**
     * Reads collected output paths from an agent collect response.
     *
     * @param value Agent JSON body
     * @returns Output path list
     */
    function readOutputPaths(value: unknown): string[] {
        if (!isAgentJsonRecord(value)) {
            return [];
        }

        const paths = value.paths;

        if (!Array.isArray(paths)) {
            return [];
        }

        return paths.filter((entry): entry is string => typeof entry === "string");
    }

    /**
     * Narrows unknown agent JSON to a string-keyed record.
     *
     * @param value Agent response body
     * @returns Whether the value is a plain object bag
     */
    function isAgentJsonRecord(value: unknown): value is Record<string, unknown> {
        return typeof value === "object" && value !== null && !Array.isArray(value);
    }
}
