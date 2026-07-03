import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../../../packages/ui/packages/backend/src/App";

describe("ui-backend auth", () => {
    afterEach(() => {
        delete process.env.ADMIN_API_KEY;
    });

    it("allows unauthenticated health checks", async () => {
        const app = await createApp({
            adminApiKey: "secret-key",
            logger: false
        });

        const response = await app.inject({
            method: "GET",
            url: "/health"
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
            status: "ok",
            service: "ui-backend"
        });

        await app.close();
    });

    it("rejects cluster routes without authorization", async () => {
        const app = await createApp({
            adminApiKey: "secret-key",
            logger: false
        });

        const response = await app.inject({
            method: "GET",
            url: "/nodes"
        });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({ message: "Unauthorized." });

        await app.close();
    });

    it("rejects cluster routes with an invalid bearer token", async () => {
        const app = await createApp({
            adminApiKey: "secret-key",
            logger: false
        });

        const response = await app.inject({
            method: "GET",
            url: "/nodes",
            headers: {
                authorization: "Bearer wrong-key"
            }
        });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({ message: "Unauthorized." });

        await app.close();
    });

    it("rejects all routes when admin API key is not configured", async () => {
        const app = await createApp({
            adminApiKey: undefined,
            logger: false
        });

        const response = await app.inject({
            method: "GET",
            url: "/nodes"
        });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({ message: "Admin API key is not configured." });

        await app.close();
    });
});
