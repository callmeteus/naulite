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
        }, "fallback", "no targets")).toBe("minimal:web-1: Scheduled node is offline.");
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
