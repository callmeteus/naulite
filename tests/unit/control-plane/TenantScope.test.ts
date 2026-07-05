import { describe, expect, it } from "vitest";

import type { FastifyRequest } from "fastify";

import { TenantScope } from "../../../packages/control-plane/src/modules/tenant/TenantScope";

describe("TenantScope", () => {
    it("does not scope queries when multi-tenant mode is disabled", () => {
        const previous = process.env.NAULITE_MULTI_TENANT;
        process.env.NAULITE_MULTI_TENANT = "false";

        const scoped = TenantScope.applyTenantFilter({ status: "active" }, "tenant-1");

        expect(scoped).toEqual({ status: "active" });

        process.env.NAULITE_MULTI_TENANT = previous;
    });

    it("adds tenant id to queries when multi-tenant mode is enabled", () => {
        const previous = process.env.NAULITE_MULTI_TENANT;
        process.env.NAULITE_MULTI_TENANT = "true";

        const scoped = TenantScope.applyTenantFilter({ status: "active" }, "tenant-1");

        expect(scoped).toEqual({
            status: "active",
            tenantId: "tenant-1"
        });

        process.env.NAULITE_MULTI_TENANT = previous;
    });

    it("resolves tenant id from request context or header", () => {
        const request = {
            tenantId: "from-session",
            headers: {
                "x-naulite-tenant-id": "from-header"
            }
        } as FastifyRequest;

        expect(TenantScope.resolveTenantId(request)).toBe("from-session");

        const headerOnlyRequest = {
            headers: {
                "x-naulite-tenant-id": "from-header"
            }
        } as FastifyRequest;

        expect(TenantScope.resolveTenantId(headerOnlyRequest)).toBe("from-header");
    });
});
