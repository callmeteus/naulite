import type { Node, PipelineRun, PipelineStep } from "@naulite/sdk";

/**
 * Host-level outcome for the run detail Nodes tab.
 */
export interface RunHostEventRow {
    nodeId: string;
    hostname: string;
    status: "ok" | "failed" | "unreachable";
    stepCount: number;
    sandboxIncusName?: string;
}

/**
 * Formats elapsed time between two ISO timestamps.
 *
 * @param startedAt Run start timestamp
 * @param completedAt Run end timestamp or undefined for live elapsed
 * @param nowMs Current time in milliseconds
 * @returns Human-readable duration
 */
export function formatRunElapsed(
    startedAt: string | undefined,
    completedAt: string | undefined,
    nowMs: number = Date.now()
): string {
    if (!startedAt) {
        return "-";
    }

    const startMs = Date.parse(startedAt);

    if (Number.isNaN(startMs)) {
        return "-";
    }

    const endMs = completedAt ? Date.parse(completedAt) : nowMs;

    if (Number.isNaN(endMs)) {
        return "-";
    }

    const totalSeconds = Math.max(0, Math.floor((endMs - startMs) / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}h ${minutes}m ${seconds}s`;
    }

    if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    }

    return `${seconds}s`;
}

/**
 * Aggregates pipeline steps by node for the Nodes tab.
 *
 * @param run Pipeline run
 * @param nodes Cluster nodes for hostname lookup
 * @returns Rows sorted by node id
 */
export function aggregateRunHostEvents(run: PipelineRun, nodes: Node[]): RunHostEventRow[] {
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    const buckets = new Map<string, PipelineStep[]>();

    for (const step of run.steps ?? []) {
        if (!step.nodeId) {
            continue;
        }

        const existing = buckets.get(step.nodeId) ?? [];
        existing.push(step);
        buckets.set(step.nodeId, existing);
    }

    const rows: RunHostEventRow[] = [];

    for (const [nodeId, steps] of buckets.entries()) {
        const node = nodesById.get(nodeId);
        let status: RunHostEventRow["status"] = "ok";

        if (!node || node.status === "offline" || node.status === "unhealthy" || !node.agentUrl) {
            status = "unreachable";
        } else if (steps.some((step) => step.status === "failed")) {
            status = "failed";
        }

        rows.push({
            nodeId,
            hostname: node?.hostname ?? nodeId,
            status,
            stepCount: steps.length
        });
    }

    for (const event of run.events ?? []) {
        const message = event.message ?? "";

        if (!message.startsWith("sandbox:")) {
            continue;
        }

        const incusName = message.slice("sandbox:".length);

        rows.push({
            nodeId: incusName,
            hostname: incusName,
            status: "ok",
            stepCount: 0,
            sandboxIncusName: incusName
        });
    }

    return rows.sort((left, right) => left.hostname.localeCompare(right.hostname));
}

/**
 * Returns whether a step log panel should start collapsed.
 *
 * @param step Pipeline step
 * @returns True when the step succeeded and can collapse
 */
export function shouldCollapseStepOutput(step: PipelineStep): boolean {
    return step.status === "succeeded";
}

/**
 * Filters step log lines by a case-insensitive search query.
 *
 * @param logText Full step log text
 * @param query Search string from the operator
 * @returns Filtered log text or the original when the query is empty
 */
export function filterStepLogText(logText: string, query: string): string {
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
        return logText;
    }

    const needle = trimmedQuery.toLowerCase();

    return logText
        .split("\n")
        .filter((line) => line.toLowerCase().includes(needle))
        .join("\n");
}

/**
 * Parses top-level vars keys from manifest YAML for the apply survey.
 *
 * @param manifestYaml Raw manifest YAML
 * @returns Var names declared under vars:
 */
export function parseManifestVarNames(manifestYaml: string): string[] {
    const lines = manifestYaml.split("\n");
    let inVars = false;
    const names: string[] = [];

    for (const line of lines) {
        if (!inVars) {
            if (/^vars:\s*$/.test(line.trim())) {
                inVars = true;
            }

            continue;
        }

        if (/^\S/.test(line) && !line.startsWith(" ")) {
            break;
        }

        const match = line.match(/^\s{2}([A-Za-z_][A-Za-z0-9_]*):\s*/);

        if (match?.[1]) {
            names.push(match[1]);
        }
    }

    return names;
}
