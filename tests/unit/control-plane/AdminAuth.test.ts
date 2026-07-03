import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../../../packages/control-plane/src/App";
import type { ControlPlaneContext } from "../../../packages/control-plane/src/ControlPlaneContext";

const adminUser = {
    id: "user-1",
    username: "admin",
    role: "admin" as const,
    tenantId: null,
    createdAt: "2026-07-03T00:00:00.000Z",
    updatedAt: "2026-07-03T00:00:00.000Z"
};

vi.mock("../../../packages/control-plane/src/modules/admin/AdminService", () => ({
    AdminService: {
        countUsers: vi.fn(async () => 0),
        login: vi.fn(async (username: string, password: string) => {
            if (username === "admin" && password === "secret-password") {
                return {
                    sessionToken: "session-token",
                    expiresAt: "2026-07-04T00:00:00.000Z",
                    user: adminUser
                };
            }

            return null;
        }),
        resolveSession: vi.fn(async (token: string) => token === "session-token" ? adminUser : null),
        logout: vi.fn(async (token: string) => token === "session-token"),
        createBootstrapUser: vi.fn(async (input: { username: string }) => ({
            ...adminUser,
            username: input.username
        }))
    }
}));

/**
 * Builds a minimal control plane context for admin route tests.
 *
 * @returns Mocked control plane context
 */
function createAdminTestContext(): ControlPlaneContext {
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

describe("admin auth routes", () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it("rejects login with invalid credentials", async () => {
        const app = await createApp({
            context: createAdminTestContext(),
            logger: false
        });

        const response = await app.inject({
            method: "POST",
            url: "/admin/login",
            payload: {
                username: "admin",
                password: "wrong-password"
            }
        });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({ message: "Invalid username or password." });

        await app.close();
    });

    it("returns a session token on successful login", async () => {
        const app = await createApp({
            context: createAdminTestContext(),
            logger: false
        });

        const response = await app.inject({
            method: "POST",
            url: "/admin/login",
            payload: {
                username: "admin",
                password: "secret-password"
            }
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
            sessionToken: "session-token",
            expiresAt: "2026-07-04T00:00:00.000Z",
            user: adminUser
        });

        await app.close();
    });

    it("rejects me without a session token", async () => {
        const app = await createApp({
            context: createAdminTestContext(),
            logger: false
        });

        const response = await app.inject({
            method: "GET",
            url: "/admin/me"
        });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({ message: "Unauthorized." });

        await app.close();
    });

    it("returns the current user for a valid session", async () => {
        const app = await createApp({
            context: createAdminTestContext(),
            logger: false
        });

        const response = await app.inject({
            method: "GET",
            url: "/admin/me",
            headers: {
                "x-platform-session": "session-token"
            }
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ user: adminUser });

        await app.close();
    });

    it("revokes an active session on logout", async () => {
        const app = await createApp({
            context: createAdminTestContext(),
            logger: false
        });

        const response = await app.inject({
            method: "POST",
            url: "/admin/logout",
            headers: {
                "x-platform-session": "session-token"
            }
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ revoked: true });

        await app.close();
    });

    it("rejects bootstrap requests from remote callers", async () => {
        const app = await createApp({
            context: createAdminTestContext(),
            logger: false
        });

        const response = await app.inject({
            method: "POST",
            url: "/admin/bootstrap",
            remoteAddress: "203.0.113.10",
            payload: {
                username: "admin",
                password: "secret-password"
            }
        });

        expect(response.statusCode).toBe(403);
        expect(response.json()).toEqual({ message: "Forbidden." });

        await app.close();
    });

    it("creates the first admin user from loopback bootstrap", async () => {
        const app = await createApp({
            context: createAdminTestContext(),
            logger: false
        });

        const response = await app.inject({
            method: "POST",
            url: "/admin/bootstrap",
            remoteAddress: "127.0.0.1",
            payload: {
                username: "operator",
                password: "secret-password"
            }
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
            user: {
                ...adminUser,
                username: "operator"
            }
        });

        await app.close();
    });
});
