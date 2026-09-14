import type { NaulitePermission } from "@naulite/shared";
import { PermissionCatalog, RolePermissions } from "@naulite/shared";
import { describe, expect, it } from "vitest";

/**
 * Returns whether a permission would pass the preHandler for a role.
 *
 * @param role Admin role
 * @param permission Required permission
 * @returns Whether the role includes the permission
 */
function roleAllows(role: "viewer" | "operator" | "admin", permission: NaulitePermission): boolean {
    return RolePermissions.roleHasPermission(role, permission);
}

describe("TargetGroupPermissions", () => {
    it("allows GET target-groups with nodes:read for viewer", () => {
        expect(roleAllows("viewer", "nodes:read")).toBe(true);
        expect(roleAllows("viewer", "nodes:write")).toBe(false);
    });

    it("allows mutating target groups only with nodes:write for operator", () => {
        expect(roleAllows("operator", "nodes:write")).toBe(true);
        expect(roleAllows("viewer", "nodes:write")).toBe(false);
    });

    it("includes nodes:write in permission catalog", () => {
        expect(PermissionCatalog.all()).toContain("nodes:write");
    });
});
