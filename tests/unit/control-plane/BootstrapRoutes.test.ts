import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../../../packages/control-plane/src/App";
import type { ControlPlaneContext } from "../../../packages/control-plane/src/ControlPlaneContext";
import {
    resolvePublicControlPlaneUrl,
    resolvePublicNetBirdManagementUrl
} from "../../../packages/control-plane/src/routes/bootstrapUrls";

const ENV_KEYS = [
    "PLATFORM_PUBLIC_URL",
    "NETBIRD_PUBLIC_MANAGEMENT_URL",
    "NETBIRD_MANAGEMENT_URL"
] as const;

const originalEnv: Record<string, string | undefined> = {};

function snapshotEnv(): void {
    for (const key of ENV_KEYS) {
        originalEnv[key] = process.env[key];
    }
}

function restoreEnv(): void {
    for (const key of ENV_KEYS) {
        if (originalEnv[key] === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = originalEnv[key];
        }
    }
}

function createBootstrapTestContext(): ControlPlaneContext {
    return {
        store: {
            getClusterSecretValues: vi.fn(async () => ({ key: "setup-key-valid" })),
            validateApiKey: vi.fn(async () => false)
        },
        netBirdEnrollment: {
            ensureSetupKey: vi.fn(async () => "setup-key-generated")
        }
    } as unknown as ControlPlaneContext;
}

describe("bootstrapUrls", () => {
    afterEach(() => {
        restoreEnv();
    });

    it("prefers PLATFORM_PUBLIC_URL over forwarded headers", () => {
        snapshotEnv();
        process.env.PLATFORM_PUBLIC_URL = "https://cp.example.com/";

        const url = resolvePublicControlPlaneUrl({
            headers: {
                host: "ignored.example.com",
                "x-forwarded-host": "ignored.example.com",
                "x-forwarded-proto": "http"
            }
        } as never);

        expect(url).toBe("https://cp.example.com");
    });

    it("builds control plane URL from forwarded headers when env is unset", () => {
        snapshotEnv();
        delete process.env.PLATFORM_PUBLIC_URL;

        const url = resolvePublicControlPlaneUrl({
            headers: {
                host: "cp.internal:8080",
                "x-forwarded-host": "cp.example.com",
                "x-forwarded-proto": "https"
            }
        } as never);

        expect(url).toBe("https://cp.example.com");
    });

    it("normalizes NetBird management URL by stripping /api suffix", () => {
        snapshotEnv();
        process.env.NETBIRD_PUBLIC_MANAGEMENT_URL = "https://vpn.example.com/api/";

        expect(resolvePublicNetBirdManagementUrl()).toBe("https://vpn.example.com");
    });

    it("falls back to NETBIRD_MANAGEMENT_URL when public URL is unset", () => {
        snapshotEnv();
        delete process.env.NETBIRD_PUBLIC_MANAGEMENT_URL;
        process.env.NETBIRD_MANAGEMENT_URL = "http://netbird-server/";

        expect(resolvePublicNetBirdManagementUrl()).toBe("http://netbird-server");
    });
});

describe("bootstrap routes", () => {
    afterEach(() => {
        restoreEnv();
    });

    it("returns agent bootstrap bundle for a valid setup key without API auth", async () => {
        snapshotEnv();
        process.env.PLATFORM_PUBLIC_URL = "https://cp.example.com";
        process.env.NETBIRD_PUBLIC_MANAGEMENT_URL = "https://vpn.example.com";

        const context = createBootstrapTestContext();
        const app = await createApp({ context, logger: false });

        const response = await app.inject({
            method: "GET",
            url: "/bootstrap/agent",
            remoteAddress: "203.0.113.10",
            headers: {
                "x-platform-setup-key": "setup-key-valid"
            }
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
            cpUrl: "https://cp.example.com",
            netbirdManagementUrl: "https://vpn.example.com"
        });

        await app.close();
    });

    it("returns 401 when setup key header is missing", async () => {
        snapshotEnv();
        process.env.NETBIRD_PUBLIC_MANAGEMENT_URL = "https://vpn.example.com";

        const app = await createApp({
            context: createBootstrapTestContext(),
            logger: false
        });

        const response = await app.inject({
            method: "GET",
            url: "/bootstrap/agent",
            remoteAddress: "203.0.113.10"
        });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({ message: "Missing setup key." });

        await app.close();
    });

    it("returns 403 when setup key does not match stored secret", async () => {
        snapshotEnv();
        process.env.NETBIRD_PUBLIC_MANAGEMENT_URL = "https://vpn.example.com";

        const context = createBootstrapTestContext();
        const app = await createApp({ context, logger: false });

        const response = await app.inject({
            method: "GET",
            url: "/bootstrap/agent",
            remoteAddress: "203.0.113.10",
            headers: {
                "x-platform-setup-key": "wrong-key"
            }
        });

        expect(response.statusCode).toBe(403);
        expect(response.json()).toEqual({ message: "Invalid setup key." });

        await app.close();
    });

    it("returns 503 when NetBird management URL is not configured", async () => {
        snapshotEnv();
        delete process.env.NETBIRD_PUBLIC_MANAGEMENT_URL;
        delete process.env.NETBIRD_MANAGEMENT_URL;

        const app = await createApp({
            context: createBootstrapTestContext(),
            logger: false
        });

        const response = await app.inject({
            method: "GET",
            url: "/bootstrap/agent",
            remoteAddress: "203.0.113.10",
            headers: {
                "x-platform-setup-key": "setup-key-valid"
            }
        });

        expect(response.statusCode).toBe(503);
        expect(response.json()).toEqual({ message: "NetBird management URL is not configured." });

        await app.close();
    });

    it("returns setup key on loopback without API auth", async () => {
        const context = createBootstrapTestContext();
        const app = await createApp({ context, logger: false });

        const response = await app.inject({
            method: "GET",
            url: "/bootstrap/setup-key",
            remoteAddress: "127.0.0.1"
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ setupKey: "setup-key-generated" });
        expect(context.netBirdEnrollment.ensureSetupKey).toHaveBeenCalledTimes(1);

        await app.close();
    });

    it("rejects setup key endpoint from remote callers", async () => {
        const app = await createApp({
            context: createBootstrapTestContext(),
            logger: false
        });

        const response = await app.inject({
            method: "GET",
            url: "/bootstrap/setup-key",
            remoteAddress: "203.0.113.10"
        });

        expect(response.statusCode).toBe(403);
        expect(response.json()).toEqual({ message: "Forbidden." });

        await app.close();
    });

    it("keeps non-bootstrap remote routes behind API key auth", async () => {
        const app = await createApp({
            context: createBootstrapTestContext(),
            logger: false
        });

        const response = await app.inject({
            method: "GET",
            url: "/nodes",
            remoteAddress: "203.0.113.10"
        });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({ message: "Unauthorized." });

        await app.close();
    });
});
