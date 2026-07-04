import { afterEach, describe, expect, it, vi } from "vitest";

import { WebhookNotificationProvider } from "../../../../packages/plugins/notification-webhook/src/WebhookNotificationProvider";

describe("WebhookNotificationProvider", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("posts neutral JSON payload to the configured webhook URL", async () => {
        const fetchImpl = vi.fn(async () => ({
            ok: true,
            status: 200
        }));
        const provider = new WebhookNotificationProvider({
            webhookUrl: "https://example.test/hook",
            fetchImpl: fetchImpl as typeof fetch
        });

        await provider.onPipelineEvent({
            kind: "rollout.started",
            runId: "demo-abc12",
            serviceName: "api",
            imageRef: "ghcr.io/acme/api:sha",
            message: "ignored by payload builder",
            createdAt: "2026-07-02T12:34:00.000Z"
        });

        expect(fetchImpl).toHaveBeenCalledTimes(1);
        const [, init] = fetchImpl.mock.calls[0] ?? [];
        expect(init?.method).toBe("POST");
        expect(init?.headers).toMatchObject({
            "content-type": "application/json"
        });

        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        expect(body.kind).toBe("rollout.started");
        expect(body.runId).toBe("demo-abc12");
        expect(body.app).toBe("api");
        expect(body.imageRef).toBe("ghcr.io/acme/api:sha");
    });

    it("adds an HMAC signature header when secret is configured", async () => {
        const fetchImpl = vi.fn(async () => ({
            ok: true,
            status: 200
        }));
        const provider = new WebhookNotificationProvider({
            webhookUrl: "https://example.test/hook",
            webhookSecret: "top-secret",
            fetchImpl: fetchImpl as typeof fetch
        });

        await provider.onPipelineEvent({
            kind: "ci.build.submitted",
            runId: "demo-abc12",
            serviceName: "api",
            message: "Teste de notificação.",
            createdAt: "2026-07-02T12:34:00.000Z"
        });

        const [, init] = fetchImpl.mock.calls[0] ?? [];
        const headers = init?.headers as Record<string, string>;
        expect(headers["x-platform-signature"]).toMatch(/^sha256=[a-f0-9]{64}$/);
    });

    it("skips delivery when webhook URL is unset", async () => {
        const fetchImpl = vi.fn(async () => ({
            ok: true,
            status: 200
        }));
        const provider = new WebhookNotificationProvider({
            webhookUrl: "",
            fetchImpl: fetchImpl as typeof fetch
        });

        await provider.onPipelineEvent({
            kind: "rollout.started",
            runId: "demo-abc12",
            message: "Teste",
            createdAt: "2026-07-02T12:34:00.000Z"
        });

        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("throws when webhook delivery fails", async () => {
        const fetchImpl = vi.fn(async () => ({
            ok: false,
            status: 502
        }));
        const provider = new WebhookNotificationProvider({
            webhookUrl: "https://example.test/hook",
            fetchImpl: fetchImpl as typeof fetch
        });

        await expect(provider.onPipelineEvent({
            kind: "rollout.started",
            runId: "demo-abc12",
            message: "Teste",
            createdAt: "2026-07-02T12:34:00.000Z"
        })).rejects.toThrow("Webhook notification failed with status 502");
    });
});
