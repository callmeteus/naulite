import type {
    PaginatedList,
    PaginationQuery,
    SandboxTemplate,
    CreateSandboxTemplateBody,
    UpdateSandboxTemplateBody
} from "@naulite/shared";

import { ControlPlaneService } from "../ControlPlaneService";
import { HTTP404Error, HTTP409Error } from "../errors/TreatedError";

import { AgentProxyService } from "./AgentProxyService";
import { SandboxService } from "./SandboxService";

/**
 * CRUD and bake operations for sandbox templates.
 */
export namespace SandboxTemplateService {
    /**
     * Lists sandbox templates.
     *
     * @param pagination Pagination query
     * @returns Paginated templates
     */
    export async function list(pagination: PaginationQuery = { page: 1, limit: 50 }): Promise<PaginatedList<SandboxTemplate>> {
        return ControlPlaneService.Store.listSandboxTemplates(pagination);
    }

    /**
     * Returns a sandbox template by id.
     *
     * @param id Template id
     * @returns Template row
     * @throws {HTTP404Error} {@link HTTP404Error}
     */
    export async function get(id: string): Promise<SandboxTemplate> {
        const template = await ControlPlaneService.Store.getSandboxTemplate(id);

        if (!template) {
            throw new HTTP404Error("Sandbox template not found.", {
                error: "not_found"
            });
        }

        return template;
    }

    /**
     * Registers a sandbox template after a host bake.
     *
     * @param body Create payload
     * @returns Persisted template
     * @throws {HTTP409Error} {@link HTTP409Error}
     */
    export async function create(body: CreateSandboxTemplateBody): Promise<SandboxTemplate> {
        const existing = await ControlPlaneService.Store.getSandboxTemplate(body.id);

        if (existing) {
            throw new HTTP409Error("Sandbox template already exists.", {
                error: "conflict"
            });
        }

        const node = await ControlPlaneService.Store.getNode(body.nodeId);

        if (!node?.agentUrl) {
            throw new HTTP404Error("Sandbox host node is unavailable.", {
                error: "not_found"
            });
        }

        if (!SandboxService.isCowSandboxNode(node)) {
            throw new HTTP409Error("Node is not sandbox-capable (CoW pool required).", {
                error: "conflict"
            });
        }

        const now = new Date().toISOString();
        const template: SandboxTemplate = {
            id: body.id,
            nodeId: body.nodeId,
            incusName: body.incusName,
            snapshot: body.snapshot ?? "base",
            modulesVolume: body.modulesVolume ?? null,
            warmPoolSize: body.warmPoolSize ?? 0,
            bakeCron: body.bakeCron ?? null,
            bakedAt: body.bakedAt ?? now,
            sizeBytes: body.sizeBytes ?? null,
            createdAt: now,
            updatedAt: now
        };

        await ControlPlaneService.Store.saveSandboxTemplate(template);
        await SandboxService.replenishWarmPool(template, node);

        return get(body.id);
    }

    /**
     * Updates warm pool and bake cron settings.
     *
     * @param id Template id
     * @param body Update payload
     * @returns Updated template
     */
    export async function update(id: string, body: UpdateSandboxTemplateBody): Promise<SandboxTemplate> {
        const existing = await get(id);
        const now = new Date().toISOString();
        const updated: SandboxTemplate = {
            ...existing,
            warmPoolSize: body.warmPoolSize ?? existing.warmPoolSize,
            bakeCron: body.bakeCron !== undefined ? body.bakeCron : existing.bakeCron,
            updatedAt: now
        };

        await ControlPlaneService.Store.saveSandboxTemplate(updated);

        const node = await ControlPlaneService.Store.getNode(updated.nodeId);

        if (node) {
            await SandboxService.replenishWarmPool(updated, node);
        }

        return get(id);
    }

    /**
     * Marks a manual bake as started and refreshes warm pool sizing on the host.
     *
     * @param id Template id
     * @returns Accepted bake status
     */
    export async function triggerBake(id: string): Promise<{ status: string; templateId: string }> {
        const template = await get(id);
        const node = await ControlPlaneService.Store.getNode(template.nodeId);

        if (!node?.agentUrl) {
            throw new HTTP404Error("Sandbox host node is unavailable.", {
                error: "not_found"
            });
        }

        const bakeScript = process.env.NAULITE_SANDBOX_BAKE_SCRIPT
            ?? "dogfood/scripts/bake-luckymaker-sandbox.sh";

        await AgentProxyService.postTask(node.agentUrl, "/tasks/sandbox/bake", {
            parent: template.incusName,
            modulesVolume: template.modulesVolume ?? template.incusName,
            script: bakeScript
        });

        const now = new Date().toISOString();
        const refreshed: SandboxTemplate = {
            ...template,
            bakedAt: now,
            updatedAt: now
        };

        await ControlPlaneService.Store.saveSandboxTemplate(refreshed);
        await SandboxService.replenishWarmPool(refreshed, node);

        return {
            status: "accepted",
            templateId: template.id
        };
    }
}
