import { randomUUID } from "node:crypto";

import {
    HostInventorySchema,
    HostPackageSchema,
    HostPackageManagerSchema,
    HostUpdateRunSchema,
    buildPaginatedList,
    paginationOffset,
    type HostInventory,
    type HostInventoryPage,
    type HostInventoryStatusFilter,
    type HostPackage,
    type HostUpdateRun,
    type Node
} from "@naulite/shared";

import { AgentProxyService } from "./AgentProxyService";

type AgentInventoryResponse = {
    packageManager?: string;
    packages?: Array<{
        name: string;
        installedVersion: string;
        availableVersion?: string;
        status: "upToDate" | "outdated";
    }>;
    summary?: {
        total: number;
        outdated: number;
    };
    error?: string;
};

type AgentUpdateResponse = {
    status?: string;
    packages?: string[];
    rebootRequired?: boolean;
    stdout?: string;
    stderr?: string;
    error?: string;
};

/**
 * Host package inventory and update orchestration.
 */
export namespace HostPackageService {
    /**
     * Ensures the node exists and exposes an agent URL.
     *
     * @param getNode Node lookup callback
     * @param nodeId Node identifier
     * @returns Online node with agent URL
     * @throws {HostPackageError} When the node is missing or has no agent URL
     */
    export async function requireAgentNode(
        getNode: (nodeId: string) => Promise<Node | null>,
        nodeId: string
    ): Promise<Node> {
        const node = await getNode(nodeId);

        if (!node) {
            throw new HostPackageError("not_found", `Node ${nodeId} not found.`, 404, {
                i18n: "errors.nodeNotFound",
                i18nParams: { nodeId }
            });
        }

        if (!node.agentUrl) {
            throw new HostPackageError("agent_unavailable", "Node does not expose an agent URL.", 503, {
                i18n: "errors.agentUrlMissing",
                i18nParams: { nodeId }
            });
        }

        return node;
    }

    /**
     * Returns whether a package row matches the requested status filter.
     *
     * @param packageStatus Package update status
     * @param filter Requested status filter
     * @returns `true` when the row belongs on this page
     */
    function matchesStatus(packageStatus: HostPackage["status"], filter: HostInventoryStatusFilter): boolean {
        if (filter === "all") {
            return true;
        }

        return packageStatus === filter;
    }

    /**
     * Returns one page of a stored host inventory.
     *
     * Summary counts stay on the full snapshot. `total` is the count after the status filter.
     *
     * @param inventory Stored host inventory
     * @param query Page, limit, and status filter
     * @returns Inventory page for the control plane response
     */
    export function pageInventory(
        inventory: HostInventory,
        query: {
            page: number;
            limit: number;
            status: HostInventoryStatusFilter;
        }
    ): HostInventoryPage {
        const matched = inventory.packages.filter((entry) => matchesStatus(entry.status, query.status));
        const offset = paginationOffset(query.page, query.limit);
        const items = matched.slice(offset, offset + query.limit);
        const page = buildPaginatedList(items, matched.length, query.page, query.limit);

        return {
            nodeId: inventory.nodeId,
            packageManager: inventory.packageManager,
            summary: inventory.summary,
            collectedAt: inventory.collectedAt,
            status: query.status,
            items: page.items,
            total: page.total,
            page: page.page,
            limit: page.limit,
            hasMore: page.hasMore
        };
    }

    /**
     * Collects and persists the host inventory for a node.
     *
     * @param node Target node
     * @param saveInventory Inventory persistence callback
     * @returns Persisted host inventory snapshot
     * @throws {HostPackageError} When the agent URL is missing or inventory collection fails
     */
    export async function refreshInventory(
        node: Node,
        saveInventory: (inventory: HostInventory) => Promise<void>
    ): Promise<HostInventory> {
        if (!node.agentUrl) {
            throw new HostPackageError("agent_unavailable", "Node does not expose an agent URL.", 503, {
                i18n: "errors.agentUrlMissing",
                i18nParams: { nodeId: node.id }
            });
        }

        const response = await AgentProxyService.postTask(
            node.agentUrl,
            "/tasks/host-inventory",
            {},
        ) as AgentInventoryResponse;

        if (response.error === "unsupported_os") {
            throw new HostPackageError(
                "unsupported_os",
                "Host package inventory is only supported on Linux nodes.",
                400,
                {
                    i18n: "errors.hostInventoryUnsupportedOs"
                }
            );
        }

        const packages = (response.packages ?? []).map((entry) => HostPackageSchema.parse(entry));
        const packageManager = HostPackageManagerSchema.parse(response.packageManager ?? "apt");
        const collectedAt = new Date().toISOString();
        const inventory = HostInventorySchema.parse({
            nodeId: node.id,
            packageManager,
            packages,
            summary: response.summary ?? {
                total: packages.length,
                outdated: packages.filter((entry) => entry.status === "outdated").length
            },

            collectedAt
        });

        await saveInventory(inventory);
        return inventory;
    }

    /**
     * Updates host packages and records the run.
     *
     * @param node Target node
     * @param packages Optional package names to update
     * @param saveRun Run persistence callback
     * @param saveInventory Inventory persistence callback
     * @returns Completed host update run
     */
    export async function updatePackages(
        node: Node,
        packages: string[] | undefined,
        saveRun: (run: HostUpdateRun) => Promise<void>,
        saveInventory: (inventory: HostInventory) => Promise<void>
    ): Promise<HostUpdateRun> {
        return dispatchUpdate(node, "packages", packages, saveRun, saveInventory);
    }

    /**
     * Performs a full system update and records the run.
     *
     * @param node Target node
     * @param saveRun Run persistence callback
     * @param saveInventory Inventory persistence callback
     * @returns Completed host update run
     */
    export async function updateSystem(
        node: Node,
        saveRun: (run: HostUpdateRun) => Promise<void>,
        saveInventory: (inventory: HostInventory) => Promise<void>
    ): Promise<HostUpdateRun> {
        return dispatchUpdate(node, "system", undefined, saveRun, saveInventory);
    }

    async function dispatchUpdate(
        node: Node,
        kind: HostUpdateRun["kind"],
        packages: string[] | undefined,
        saveRun: (run: HostUpdateRun) => Promise<void>,
        saveInventory: (inventory: HostInventory) => Promise<void>
    ): Promise<HostUpdateRun> {
        if (!node.agentUrl) {
            throw new HostPackageError("agent_unavailable", "Node does not expose an agent URL.", 503, {
                i18n: "errors.agentUrlMissing",
                i18nParams: { nodeId: node.id }
            });
        }

        const now = new Date().toISOString();
        const run = HostUpdateRunSchema.parse({
            id: randomUUID(),
            nodeId: node.id,
            kind,
            status: "running",
            packages: packages ?? [],
            rebootRequired: false,
            startedAt: now,
            createdAt: now
        });

        await saveRun(run);

        const path = kind === "system" ? "/tasks/system-update" : "/tasks/package-update";
        const payload = kind === "system" ? {} : { packages: packages ?? [] };

        try {
            const response = await AgentProxyService.postTask(node.agentUrl, path, payload) as AgentUpdateResponse;

            if (response.error === "unsupported_os") {
                throw new HostPackageError(
                    "unsupported_os",
                    "Host updates are only supported on Linux nodes.",
                    400,
                    {
                        i18n: "errors.hostUpdatesUnsupportedOs"
                    }
                );
            }

            const completedAt = new Date().toISOString();
            const completed = HostUpdateRunSchema.parse({
                ...run,
                status: response.status === "succeeded" ? "succeeded" : "failed",
                packages: response.packages ?? packages ?? [],
                rebootRequired: response.rebootRequired ?? false,
                stdout: response.stdout,
                stderr: response.stderr,
                errorMessage: response.error,
                completedAt
            });

            await saveRun(completed);

            if (completed.status === "succeeded") {
                await refreshInventory(node, saveInventory);
            }

            return completed;
        } catch (err) {
            const completedAt = new Date().toISOString();
            const message = err instanceof Error ? err.message : "Host update failed.";
            const failed = HostUpdateRunSchema.parse({
                ...run,
                status: "failed",
                errorMessage: message,
                completedAt
            });

            await saveRun(failed);
            throw err;
        }
    }
}

/**
 * Domain error for host package operations.
 */
export class HostPackageError extends Error {
    /**
     * @param code Machine-readable error code
     * @param message Human-readable error message
     * @param status HTTP status code
     */
    constructor(
        public readonly code: string,
        message: string,
        public readonly status: number,
        public readonly options?: {
            i18n?: string;
            i18nParams?: Record<string, string>;
        }
    ) {
        super(message);
        this.name = "HostPackageError";
    }
}
