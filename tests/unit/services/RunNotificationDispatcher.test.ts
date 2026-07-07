import { afterEach, describe, expect, it, vi } from "vitest";

import type { NotificationProvider, PipelineNotificationEvent } from "@naulite/shared";

import { RunNotificationDispatcher } from "../../../packages/control-plane/src/services/RunNotificationDispatcher";

describe("RunNotificationDispatcher", () => {
    afterEach(() => {
        RunNotificationDispatcher.resetForTests();
        vi.restoreAllMocks();
    });

    it("fans out pipeline events to every registered provider", async () => {
        const slack = vi.fn(async () => undefined);
        const webhook = vi.fn(async () => undefined);
        const event: PipelineNotificationEvent = {
            kind: "image.pushed",
            runId: "run-1",
            serviceName: "api",
            imageRef: "ghcr.io/acme/api:sha",
            message: "Image pushed",
            createdAt: "2026-07-02T12:34:00.000Z"
        };

        RunNotificationDispatcher.register("slack", { onPipelineEvent: slack });
        RunNotificationDispatcher.register("webhook", { onPipelineEvent: webhook });

        await RunNotificationDispatcher.dispatch(event);

        expect(slack).toHaveBeenCalledWith(event);
        expect(webhook).toHaveBeenCalledWith(event);
    });

    it("skips providers when the event kind is not allowed", async () => {
        const slack = vi.fn(async () => undefined);
        const event: PipelineNotificationEvent = {
            kind: "image.pushed",
            runId: "run-1",
            serviceName: "api",
            imageRef: "ghcr.io/acme/api:sha",
            message: "Image pushed",
            createdAt: "2026-07-02T12:34:00.000Z"
        };

        RunNotificationDispatcher.register("slack", { onPipelineEvent: slack }, ["ci.pipeline.failed"]);
        await RunNotificationDispatcher.dispatch(event);
        expect(slack).not.toHaveBeenCalled();
    });

    it("returns per-provider results for test pings", async () => {
        const slack = vi.fn(async () => undefined);
        const webhook = vi.fn(async () => {
            throw new Error("webhook offline");
        });

        RunNotificationDispatcher.register("slack", { onPipelineEvent: slack });
        RunNotificationDispatcher.register("webhook", { onPipelineEvent: webhook });

        const results = await RunNotificationDispatcher.testPing();

        expect(slack).toHaveBeenCalledTimes(1);
        expect(webhook).toHaveBeenCalledTimes(1);
        expect(results).toEqual([
            { id: "slack", ok: true },
            { id: "webhook", ok: false, error: "webhook offline" }
        ]);
    });
});
