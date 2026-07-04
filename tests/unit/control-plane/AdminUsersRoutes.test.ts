import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../../../packages/control-plane/src/App";
import type { ControlPlaneContext } from "../../../packages/control-plane/src/ControlPlaneContext";
import { AdminAuditService } from "../../../packages/control-plane/src/modules/admin/AdminAuditService";

const viewerUser = {
    id: "viewer-1",
    username: "viewer@example.com",
    role: "viewer" as const,
    tenantId: null,
    createdAt: "2026-07-03T00:00:00.000Z",
    updatedAt: "2026-07-03T00:00:00.000Z"
};

vi.mock("../../../packages/control-plane/src/modules/admin/AdminService", () => ({
    AdminService: {
        countUsers: vi.fn(async () => 1),
        listUsers: vi.fn(async () => [viewerUser]),
        createUser: vi.fn(),
        disableUser: vi.fn(),
        login: vi.fn(),
        resolveSession: vi.fn(async () => viewerUser),
        logout: vi.fn()
    }
}));

/**
 * Builds a minimal control plane context for admin user route tests.
 *
 * @returns Mocked control plane context
 */
function createUsersTestContext(): ControlPlaneContext {
    return {
        store: {
            validateApiKey: vi.fn(async () => false),
            getClusterSecretValues: vi.fn(async () => ({}))
        },
        netBirdEnrollment: {
            ensureSetupKey: vi.fn(async () => "setup-key-generated")
        }
    } as unknown as ControlPlaneContext;
}

describe("admin users routes", () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it("rejects viewer sessions without admin:users:write", async () => {
        const auditSpy = vi.spyOn(AdminAuditService, "record").mockResolvedValue(undefined);
        const app = await createApp({
            context: createUsersTestContext(),
            logger: false
        });

        const response = await app.inject({
            method: "POST",
            url: "/admin/users",
            headers: {
                "x-platform-session": "session-token"
            },
            payload: {
                email: "new@example.com",
                password: "long-password",
                role: "viewer"
            }
        });

        expect(response.statusCode).toBe(403);
        expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
            action: "acl.deny"
        }));

        await app.close();
    });

    it("allows viewer sessions to list users with admin:users:read", async () => {
        const app = await createApp({
            context: createUsersTestContext(),
            logger: false
        });

        const response = await app.inject({
            method: "GET",
            url: "/admin/users",
            headers: {
                "x-platform-session": "session-token"
            }
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual([viewerUser]);

        await app.close();
    });
});
