import { describe, expect, it } from "vitest";

import { PermissionCatalog } from "../../../packages/control-plane/src/auth/PermissionCatalog";
import { RolePermissions } from "../../../packages/control-plane/src/auth/RolePermissions";

describe("PermissionCatalog", () => {
    it("lists every platform permission exactly once", () => {
        const permissions = PermissionCatalog.all();
        const unique = new Set(permissions);

        expect(unique.size).toBe(permissions.length);
        expect(permissions).toContain("secrets:read");
        expect(permissions).toContain("metrics:read");
        expect(permissions).toContain("workloads:write");
        expect(permissions).toContain("admin:api-keys:write");
    });
});

describe("RolePermissions", () => {
    it("grants viewer read-only permissions", () => {
        expect(RolePermissions.roleHasPermission("viewer", "nodes:read")).toBe(true);
        expect(RolePermissions.roleHasPermission("viewer", "secrets:read")).toBe(true);
        expect(RolePermissions.roleHasPermission("viewer", "notifications:read")).toBe(false);
        expect(RolePermissions.roleHasPermission("viewer", "manifests:apply")).toBe(false);
        expect(RolePermissions.roleHasPermission("viewer", "admin:users:write")).toBe(false);
    });

    it("grants operator mutation permissions without admin user management", () => {
        expect(RolePermissions.roleHasPermission("operator", "manifests:apply")).toBe(true);
        expect(RolePermissions.roleHasPermission("operator", "nodes:provision")).toBe(true);
        expect(RolePermissions.roleHasPermission("operator", "notifications:write")).toBe(true);
        expect(RolePermissions.roleHasPermission("operator", "admin:users:write")).toBe(false);
    });

    it("grants admin every catalog permission", () => {
        for (const permission of PermissionCatalog.all()) {
            expect(RolePermissions.roleHasPermission("admin", permission)).toBe(true);
        }
    });
});
