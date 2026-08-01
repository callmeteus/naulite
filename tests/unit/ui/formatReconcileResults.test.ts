import { describe, expect, it } from "vitest";

import {
    formatInstanceReconcileError,
    formatServiceReconcileError
} from "../../../packages/ui/packages/frontend/src/utils/formatReconcileResults";

describe("formatReconcileResults", () => {
    it("formats service reconcile failures with instance ids", () => {
        expect(formatServiceReconcileError({
            serviceName: "web",
            results: [
                {
                    instanceId: "minimal:web-1",
                    status: "skipped",
                    message: "Scheduled node is offline."
                }
            ]
        }, "fallback", "no targets")).toBe("Scheduled node is offline.");
    });

    it("humanizes fetch failed for a single instance", () => {
        const t = (key: string) => key;

        expect(formatServiceReconcileError({
            serviceName: "web",
            results: [
                {
                    instanceId: "minimal:web-1",
                    status: "failed",
                    message: "fetch failed"
                }
            ]
        }, "fallback", "no targets", t)).toBe("pages.dispatchErrors.agentUnreachable");
    });

    it("returns a no-targets message when no instances were eligible", () => {
        expect(formatServiceReconcileError({
            serviceName: "web",
            results: []
        }, "fallback", "no targets")).toBe("no targets");
    });

    it("formats instance reconcile failures", () => {
        expect(formatInstanceReconcileError({
            instanceId: "minimal:web-1",
            status: "failed",
            message: "Agent dispatch failed: connection refused"
        }, "fallback")).toBe("Agent dispatch failed: connection refused");
    });
});
