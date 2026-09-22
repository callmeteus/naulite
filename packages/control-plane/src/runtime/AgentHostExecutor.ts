import type { Node, Task } from "@naulite/shared";

import { ControlPlaneService } from "../ControlPlaneService";
import { Logger } from "../Logger";
import { AgentProxyService } from "../services/AgentProxyService";
import { SandboxService, type SandboxBuildContext } from "../services/SandboxService";

import type { HostExecutor, HostExecutorResult } from "./HostExecutor";

const logHostExecutor = Logger.create("host-executor");

/**
 * Parsed agent `/tasks/command` JSON body.
 */
interface AgentCommandResult {
    changed?: boolean;
    failed?: boolean;
    rc?: number;
    stdout?: string;
    stderr?: string;
}

/**
 * Runs playbook modules on a node agent over HTTP.
 */
export class AgentHostExecutor implements HostExecutor {
    /**
     * @inheritdoc
     */
    async execute(nodeId: string, task: Task, context: Record<string, unknown>): Promise<HostExecutorResult> {
        if (task.module === "build" && task.sandbox) {
            const sandboxContext = toSandboxBuildContext(context);
            const result = await SandboxService.executeBuild(nodeId, task, sandboxContext);

            return {
                changed: result.changed,
                rc: result.rc,
                stdout: result.stdout,
                failed: false,
                sandboxInstance: result.sandboxInstance,
                outputPaths: result.outputPaths
            };
        }

        if (task.module === "build") {
            const node = await resolveAgentNode(nodeId);
            const agentUrl = node.agentUrl;

            if (!agentUrl) {
                throw new Error(`Node ${node.id} does not expose an agent URL.`);
            }

            const argv = resolveBuildCommandArgv(task.command);

            if (argv.length === 0) {
                throw new Error("build command must not be empty");
            }

            logHostExecutor.debug(
                "execute build on host node=%s argv0=%s",
                node.id,
                argv[0]
            );

            const raw = await AgentProxyService.postTask(agentUrl, "/tasks/command", {
                command: argv,
                chdir: task.chdir,
                env: task.env,
                context
            });
            const result = parseCommandResult(raw);

            if (result.failed || (result.rc !== undefined && result.rc !== 0)) {
                const detail = result.stderr?.trim() || result.stdout?.trim() || `exit ${result.rc ?? 1}`;
                throw new Error(`Build failed on ${node.id}: ${detail}`);
            }

            return {
                changed: result.changed ?? true,
                failed: false,
                rc: result.rc ?? 0,
                stdout: result.stdout ?? ""
            };
        }

        if (task.module !== "command") {
            throw new Error(`Host module ${task.module} is not implemented.`);
        }

        const argv = resolveCommandArgv(task.command);

        if (argv.length === 0) {
            throw new Error("command must not be empty");
        }

        const node = await resolveAgentNode(nodeId);
        const agentUrl = node.agentUrl;

        if (!agentUrl) {
            throw new Error(`Node ${node.id} does not expose an agent URL.`);
        }

        logHostExecutor.debug(
            "execute node=%s module=%s argv0=%s",
            node.id,
            task.module,
            argv[0]
        );

        const raw = await AgentProxyService.postTask(agentUrl, "/tasks/command", {
            command: argv,
            chdir: task.chdir,
            env: task.env,
            context
        });
        const result = parseCommandResult(raw);

        if (result.failed || (result.rc !== undefined && result.rc !== 0)) {
            const detail = result.stderr?.trim() || result.stdout?.trim() || `exit ${result.rc ?? 1}`;
            throw new Error(`Command failed on ${node.id}: ${detail}`);
        }

        return {
            changed: result.changed ?? true,
            failed: false,
            rc: result.rc ?? 0,
            stdout: result.stdout ?? ""
        };
    }
}

/**
 * Builds sandbox execution context from the host executor bag.
 *
 * @param context Host executor context
 * @returns Sandbox build context
 */
function toSandboxBuildContext(context: Record<string, unknown>): SandboxBuildContext {
    const runId = typeof context["runId"] === "string" ? context["runId"] : undefined;
    const registers = isRecord(context["registers"]) ? context["registers"] : undefined;
    const varsRaw = context["vars"];
    let vars: Record<string, string> | undefined;

    if (isRecord(varsRaw)) {
        vars = {};

        for (const [key, value] of Object.entries(varsRaw)) {
            if (typeof value === "string") {
                vars[key] = value;
            }
        }
    }

    return {
        runId,
        registers,
        vars
    };
}

/**
 * Resolves a node (or first group member) that exposes an agent URL.
 *
 * @param nodeId Task target, hostname, target group id, or `local`
 * @returns Online node with an agent URL
 * @throws {Error} {@link Error}
 */
async function resolveAgentNode(nodeId: string): Promise<Node> {
    const byId = await ControlPlaneService.Store.getNode(nodeId);

    if (byId) {
        return requireAgentUrl(byId);
    }

    const byHostname = await ControlPlaneService.Store.getNodeByHostname(nodeId);

    if (byHostname) {
        return requireAgentUrl(byHostname);
    }

    const group = await ControlPlaneService.Store.getTargetGroup(nodeId);

    if (group) {
        const nodes = await ControlPlaneService.Store.listNodes();
        const member = nodes.find((node) => {
            return group.memberNodeIds.includes(node.id) && Boolean(node.agentUrl);
        });

        if (!member) {
            throw new Error(`Target group ${nodeId} has no member with an agent URL.`);
        }

        return requireAgentUrl(member);
    }

    if (nodeId === "local") {
        const nodes = await ControlPlaneService.Store.listNodes();
        const localNode = nodes.find((node) => Boolean(node.agentUrl));

        if (localNode) {
            return requireAgentUrl(localNode);
        }
    }

    throw new Error(`Node ${nodeId} was not found.`);
}

/**
 * Ensures the node exposes an agent URL.
 *
 * @param node Cluster node
 * @returns The same node
 * @throws {Error} {@link Error}
 */
function requireAgentUrl(node: Node): Node {
    if (!node.agentUrl) {
        throw new Error(`Node ${node.id} does not expose an agent URL.`);
    }

    return node;
}

/**
 * Normalizes a task command into argv.
 *
 * @param command Task command string or argv
 * @returns Argv to send to the agent
 */
function resolveCommandArgv(command: Task["command"]): string[] {
    if (Array.isArray(command)) {
        return command.filter((part) => part.trim() !== "");
    }

    if (typeof command === "string" && command.trim() !== "") {
        return ["sh", "-c", command];
    }

    return [];
}

/**
 * Normalizes a build task command into argv.
 *
 * @param command Build task command
 * @returns Argv array
 * @throws {Error} {@link Error}
 */
function resolveBuildCommandArgv(command: Task["command"]): string[] {
    if (Array.isArray(command)) {
        return command.filter((part) => part.trim() !== "");
    }

    throw new Error("build command must be a non-empty argv array.");
}

/**
 * Narrows unknown JSON to a string-keyed object bag.
 *
 * @param value Unknown JSON value
 * @returns Whether the value is a plain object
 */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Narrows an unknown agent JSON body to a command result.
 *
 * @param value Agent JSON response
 * @returns Parsed command result
 */
function parseCommandResult(value: unknown): AgentCommandResult {
    if (!isRecord(value)) {
        return {};
    }

    const rc = value["rc"];
    const stdout = value["stdout"];
    const stderr = value["stderr"];
    const failed = value["failed"];
    const changed = value["changed"];

    return {
        changed: typeof changed === "boolean" ? changed : undefined,
        failed: typeof failed === "boolean" ? failed : undefined,
        rc: typeof rc === "number" ? rc : undefined,
        stdout: typeof stdout === "string" ? stdout : undefined,
        stderr: typeof stderr === "string" ? stderr : undefined
    };
}
