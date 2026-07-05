import { afterEach, describe, expect, it, vi } from "vitest";

import type { FastifyRequest } from "fastify";

import { AuthPreHandlers } from "../../../packages/control-plane/src/auth/AuthPreHandlers";
import { ControlPlaneService } from "../../../packages/control-plane/src/ControlPlaneService";
import type { ControlPlaneContext } from "../../../packages/control-plane/src/ControlPlaneContext";
import { AdminService } from "../../../packages/control-plane/src/modules/admin/AdminService";

vi.mock("../../../packages/control-plane/src/modules/admin/AdminService", () => ({
    AdminService: {
        resolveSession: vi.fn()
    }
}));

describe("AuthPreHandlers", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("attaches admin user context for a valid session token", async () => {
        vi.mocked(AdminService.resolveSession).mockResolvedValue({
            id: "user-1",
            username: "admin",
            role: "operator",
            tenantId: "tenant-1",
            createdAt: "2026-07-03T00:00:00.000Z",
            updatedAt: "2026-07-03T00:00:00.000Z"
        });

        const request = {
            ip: "203.0.113.10",
            headers: {
                "x-naulite-session": "session-token"
            }
        } as FastifyRequest;

        await AuthPreHandlers.enforceAuthorization(request);

        expect(request.authMethod).toBe("session");
        expect(request.adminUser?.username).toBe("admin");
        expect(request.role).toBe("operator");
        expect(request.tenantId).toBe("tenant-1");
    });

    it("falls back to api key auth when no session is present", async () => {
        const validateApiKey = vi.fn(async () => true);
        ControlPlaneService.install({
            store: {
                validateApiKey
            }
        } as unknown as ControlPlaneContext);

        const request = {
            ip: "203.0.113.10",
            headers: {
                authorization: "Bearer valid-secret"
            }
        } as FastifyRequest;

        await AuthPreHandlers.enforceAuthorization(request);

        expect(request.authMethod).toBe("api_key");
        expect(request.role).toBe("admin");
        expect(validateApiKey).toHaveBeenCalledWith("valid-secret");
    });

    it("rejects requests without session or api key", async () => {
        const request = {
            ip: "203.0.113.10",
            headers: {}
        } as FastifyRequest;

        await expect(AuthPreHandlers.enforceAuthorization(request)).rejects.toMatchObject({
            statusCode: 401,
            message: "Unauthorized."
        });
    });

    it("rejects invalid session tokens", async () => {
        vi.mocked(AdminService.resolveSession).mockResolvedValue(null);

        const request = {
            ip: "203.0.113.10",
            headers: {
                "x-naulite-session": "invalid-session"
            }
        } as FastifyRequest;

        await expect(AuthPreHandlers.enforceAuthorization(request)).rejects.toMatchObject({
            statusCode: 401,
            message: "Unauthorized."
        });
    });
});
