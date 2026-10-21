import type { Node } from "@naulite/shared";

import { AgentProxyService } from "./AgentProxyService";

/**
 * PM2 process row from `pm2 jlist`.
 */
export interface Pm2ProcessRow {
    name?: string;
    pm_id?: number;
    pm2_env?: {
        status?: string;
    };
}

/**
 * Dispatches host PM2 commands through the node agent.
 */
export namespace HostProcessDispatcher {
    /**
     * Reloads a PM2 process by name on a node.
     *
     * @param node Target node with agentUrl
     * @param processName PM2 process name
     * @param chdir Optional working directory
     * @returns Agent command result stdout
     */
    export async function reloadPm2(
        node: Node,
        processName: string,
        chdir?: string
    ): Promise<string> {
        const raw = await dispatchCommand(node, ["pm2", "reload", processName], chdir);
        return readStdout(raw);
    }

    /**
     * Returns parsed PM2 process list from the node.
     *
     * @param node Target node with agentUrl
     * @param chdir Optional working directory
     * @returns Parsed PM2 rows
     */
    export async function listPm2Processes(
        node: Node,
        chdir?: string
    ): Promise<Pm2ProcessRow[]> {
        const raw = await dispatchCommand(node, ["pm2", "jlist"], chdir);
        const stdout = readStdout(raw);

        if (!stdout.trim()) {
            return [];
        }

        try {
            const parsed = JSON.parse(stdout) as Pm2ProcessRow[];

            if (!Array.isArray(parsed)) {
                return [];
            }

            return parsed;
        } catch {
            return [];
        }
    }

    /**
     * Checks whether a PM2 process is online.
     *
     * @param node Target node
     * @param processName PM2 process name
     * @returns True when status is online
     */
    export async function isPm2ProcessOnline(
        node: Node,
        processName: string,
        chdir?: string
    ): Promise<boolean> {
        const processes = await listPm2Processes(node, chdir);

        for (const row of processes) {
            if (row.name !== processName) {
                continue;
            }

            return row.pm2_env?.status === "online";
        }

        return false;
    }

    /**
     * Posts a shell command to `/tasks/command` on the node agent.
     *
     * @param node Target node
     * @param command argv vector
     * @param chdir Optional cwd
     * @returns Raw agent JSON body
     */
    export async function dispatchCommand(
        node: Node,
        command: string[],
        chdir?: string
    ): Promise<Record<string, unknown>> {
        const agentUrl = node.agentUrl;

        if (!agentUrl) {
            throw new Error(`Node ${node.id} does not expose an agent URL.`);
        }

        const raw = await AgentProxyService.postTask(agentUrl, "/tasks/command", {
            command,
            chdir
        });

        if (!isRecord(raw)) {
            throw new Error("Agent returned an invalid command response.");
        }

        if (raw.failed === true || (typeof raw.rc === "number" && raw.rc !== 0)) {
            const detail = readAgentDetail(raw);
            throw new Error(detail);
        }

        return raw;
    }

    /**
     * Reads stdout from an agent command body.
     *
     * @param raw Agent response
     * @returns Stdout text
     */
    function readStdout(raw: Record<string, unknown>): string {
        return typeof raw.stdout === "string" ? raw.stdout : "";
    }

    /**
     * Builds a failure detail string from agent output.
     *
     * @param raw Agent response
     * @returns Error detail
     */
    function readAgentDetail(raw: Record<string, unknown>): string {
        const stderr = typeof raw.stderr === "string" ? raw.stderr.trim() : "";
        const stdout = typeof raw.stdout === "string" ? raw.stdout.trim() : "";
        const rc = typeof raw.rc === "number" ? raw.rc : 1;

        return stderr || stdout || `exit ${rc}`;
    }

    /**
     * @param value Unknown value
     * @returns True for a plain object
     */
    function isRecord(value: unknown): value is Record<string, unknown> {
        return typeof value === "object" && value !== null && !Array.isArray(value);
    }
}
