import { describe, expect, it } from "vitest";

import {
    HostInventoryPageSchema,
    HostInventorySchema,
    HostPackageListQuerySchema,
    HostPackageSchema,
    HostUpdateRequestSchema,
    HostUpdateRunSchema,
    PermissionCatalog
} from "@naulite/shared";

describe("HostInventory schemas", () => {
    it("parses a valid host inventory snapshot", () => {
        const inventory = HostInventorySchema.parse({
            nodeId: "node-1",
            packageManager: "apt",
            packages: [{
                name: "curl",
                installedVersion: "7.81.0-1",
                availableVersion: "7.81.0-2",
                status: "outdated"
            }],
            summary: {
                total: 1,
                outdated: 1
            },
            collectedAt: "2026-07-30T00:00:00.000Z"
        });

        expect(inventory.packageManager).toBe("apt");
        expect(inventory.packages[0]?.status).toBe("outdated");
    });

    it("parses a host package page and rejects an unknown status filter", () => {
        const page = HostInventoryPageSchema.parse({
            nodeId: "node-1",
            packageManager: "apt",
            summary: { total: 3, outdated: 1 },
            collectedAt: "2026-07-30T00:00:00.000Z",
            status: "outdated",
            items: [{
                name: "curl",
                installedVersion: "1",
                availableVersion: "2",
                status: "outdated"
            }],
            total: 1,
            page: 1,
            limit: 50,
            hasMore: false
        });

        expect(page.items).toHaveLength(1);
        expect(HostPackageListQuerySchema.parse({ page: "2", limit: "10" }).status).toBe("all");
        expect(() => HostPackageListQuerySchema.parse({ status: "broken" })).toThrow();
    });

    it("rejects invalid package status values", () => {
        expect(() => HostPackageSchema.parse({
            name: "curl",
            installedVersion: "1",
            status: "broken"
        })).toThrow();
    });

    it("accepts empty package update requests", () => {
        const request = HostUpdateRequestSchema.parse({});
        expect(request.packages).toBeUndefined();
    });

    it("parses host update runs", () => {
        const run = HostUpdateRunSchema.parse({
            id: "run-1",
            nodeId: "node-1",
            kind: "system",
            status: "succeeded",
            packages: ["linux-image-generic"],
            rebootRequired: true,
            createdAt: "2026-07-30T00:00:00.000Z",
            completedAt: "2026-07-30T00:01:00.000Z"
        });

        expect(run.kind).toBe("system");
        expect(run.rebootRequired).toBe(true);
    });

    it("includes nodes:host-update in the permission catalog", () => {
        expect(PermissionCatalog.all()).toContain("nodes:host-update");
    });
});
