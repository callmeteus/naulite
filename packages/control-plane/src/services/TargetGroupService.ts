import type {
    CreateTargetGroupBody,
    PaginatedList,
    PaginationQuery,
    TargetGroup,
    UpdateTargetGroupBody
} from "@naulite/shared";

import { HTTP404Error } from "../errors/TreatedError";
import { ControlPlaneService } from "../ControlPlaneService";

/**
 * CRUD operations for deployment target groups.
 */
export namespace TargetGroupService {
    /**
     * Lists target groups with pagination.
     *
     * @param pagination Pagination query
     * @returns Paginated target groups
     */
    export async function list(pagination: PaginationQuery = { page: 1, limit: 50 }): Promise<PaginatedList<TargetGroup>> {
        return ControlPlaneService.Store.listTargetGroups(pagination);
    }

    /**
     * Returns a target group by id.
     *
     * @param id Target group id
     * @returns Target group
     * @throws {HTTP404Error} {@link HTTP404Error}
     */
    export async function get(id: string): Promise<TargetGroup> {
        const group = await ControlPlaneService.Store.getTargetGroup(id);

        if (!group) {
            throw new HTTP404Error("Target group not found.", {
                error: "not_found"
            });
        }

        return group;
    }

    /**
     * Creates a target group.
     *
     * @param body Create payload
     * @returns Created target group
     */
    export async function create(body: CreateTargetGroupBody): Promise<TargetGroup> {
        const now = new Date().toISOString();
        const group: TargetGroup = {
            id: body.id,
            name: body.name,
            memberNodeIds: body.memberNodeIds ?? [],
            createdAt: now,
            updatedAt: now
        };

        await ControlPlaneService.Store.saveTargetGroup(group, group.memberNodeIds);
        return get(group.id);
    }

    /**
     * Updates a target group.
     *
     * @param id Target group id
     * @param body Update payload
     * @returns Updated target group
     */
    export async function update(id: string, body: UpdateTargetGroupBody): Promise<TargetGroup> {
        const existing = await get(id);
        const now = new Date().toISOString();
        const group: TargetGroup = {
            id: existing.id,
            name: body.name ?? existing.name,
            memberNodeIds: body.memberNodeIds ?? existing.memberNodeIds,
            createdAt: existing.createdAt,
            updatedAt: now
        };

        await ControlPlaneService.Store.saveTargetGroup(group, group.memberNodeIds);
        return get(id);
    }

    /**
     * Deletes a target group.
     *
     * @param id Target group id
     * @returns Nothing.
     */
    export async function remove(id: string): Promise<void> {
        const deleted = await ControlPlaneService.Store.deleteTargetGroup(id);

        if (!deleted) {
            throw new HTTP404Error("Target group not found.", {
                error: "not_found"
            });
        }
    }

    /**
     * Resolves online member nodes for scheduling.
     *
     * @param groupId Target group id
     * @returns Online node ids in stable order
     */
    export async function resolveOnlineMemberNodeIds(groupId: string): Promise<string[]> {
        const group = await get(groupId);
        const nodes = await ControlPlaneService.Store.listNodes();
        const onlineIds = new Set(
            nodes
                .filter((node) => node.status === "online" || node.status === "registering")
                .map((node) => node.id)
        );

        return group.memberNodeIds.filter((nodeId: string) => onlineIds.has(nodeId));
    }
}
