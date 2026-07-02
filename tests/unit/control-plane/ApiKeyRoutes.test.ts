import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../../../packages/control-plane/src/App";
import type { ControlPlaneContext } from "../../../packages/control-plane/src/ControlPlaneContext";

/**
 * Builds a control plane context with API key auth mocks.
 *
 * @returns Mocked control plane context
 */
function createApiKeyTestContext(): ControlPlaneContext {
    return {
        store: {
            listApiKeys: vi.fn(async () => [{
                id: "key-1",
                name: "panel",
                prefix: "plt_ab",
                createdAt: "2026-07-02T00:00:00.000Z",
                revokedAt: null
            }]),
            createApiKey: vi.fn(async (name: string) => ({
                id: "key-2",
                name,
                prefix: "plt_ab",
                secret: "new-secret",
                createdAt: "2026-07-02T00:00:00.000Z"
            })),
            revokeApiKey: vi.fn(async () => true),
            validateApiKey: vi.fn(async (secret: string) => secret === "valid-secret"),
            getClusterSecretValues: vi.fn(async () => ({}))
        },
        netBirdEnrollment: {
            ensureSetupKey: vi.fn(async () => "setup-key-generated")
        }
    } as unknown as ControlPlaneContext;
}

describe("api key routes", () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it("rejects remote list requests without authorization", async () => {
        const app = await createApp({
            context: createApiKeyTestContext(),
            logger: false
        });

        const response = await app.inject({
            method: "GET",
            url: "/api-keys",
            remoteAddress: "203.0.113.10"
        });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({ message: "Unauthorized." });

        await app.close();
    });

    it("rejects remote list requests with an invalid bearer token", async () => {
        const context = createApiKeyTestContext();
        const app = await createApp({ context, logger: false });

        const response = await app.inject({
            method: "GET",
            url: "/api-keys",
            remoteAddress: "203.0.113.10",
            headers: {
                authorization: "Bearer invalid-secret"
            }
        });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({ message: "Unauthorized." });
        expect(context.store.validateApiKey).toHaveBeenCalledWith("invalid-secret");

        await app.close();
    });

    it("allows remote list requests with a valid api key", async () => {
        const context = createApiKeyTestContext();
        const app = await createApp({ context, logger: false });

        const response = await app.inject({
            method: "GET",
            url: "/api-keys",
            remoteAddress: "203.0.113.10",
            headers: {
                authorization: "Bearer valid-secret"
            }
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual([{
            id: "key-1",
            name: "panel",
            prefix: "plt_ab",
            createdAt: "2026-07-02T00:00:00.000Z",
            revokedAt: null
        }]);
        expect(context.store.validateApiKey).toHaveBeenCalledWith("valid-secret");

        await app.close();
    });

    it("allows local list requests without authorization", async () => {
        const context = createApiKeyTestContext();
        const app = await createApp({ context, logger: false });

        const response = await app.inject({
            method: "GET",
            url: "/api-keys",
            remoteAddress: "127.0.0.1"
        });

        expect(response.statusCode).toBe(200);
        expect(context.store.validateApiKey).not.toHaveBeenCalled();

        await app.close();
    });

    it("rejects remote create requests without a valid api key", async () => {
        const app = await createApp({
            context: createApiKeyTestContext(),
            logger: false
        });

        const response = await app.inject({
            method: "POST",
            url: "/api-keys",
            remoteAddress: "203.0.113.10",
            payload: { name: "bootstrap" }
        });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({ message: "Unauthorized." });

        await app.close();
    });

    it("allows local create requests without authorization", async () => {
        const context = createApiKeyTestContext();
        const app = await createApp({ context, logger: false });

        const response = await app.inject({
            method: "POST",
            url: "/api-keys",
            remoteAddress: "127.0.0.1",
            payload: { name: "bootstrap" }
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
            id: "key-2",
            name: "bootstrap",
            prefix: "plt_ab",
            secret: "new-secret",
            createdAt: "2026-07-02T00:00:00.000Z"
        });
        expect(context.store.createApiKey).toHaveBeenCalledWith("bootstrap");

        await app.close();
    });
});
