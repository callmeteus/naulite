import { describe, expect, it } from "vitest";

import { E7MessageFormatter } from "../../../packages/shared/src/notifications/E7MessageFormatter";

describe("E7MessageFormatter", () => {
    it("formats rollout started messages", () => {
        const text = E7MessageFormatter.format({
            kind: "rollout.started",
            runId: "demo-abc12",
            serviceName: "api",
            imageRef: "ghcr.io/acme/api:sha",
            message: "",
            createdAt: "2026-07-02T12:34:00.000Z"
        });

        expect(text).toContain("Rollout started");
        expect(text).toContain("api");
        expect(text).toContain("ghcr.io/acme/api:sha");
    });

    it("formats pipeline failure messages with step detail", () => {
        const text = E7MessageFormatter.format({
            kind: "ci.pipeline.failed",
            runId: "api-def45",
            serviceName: "api",
            imageRef: "platform/api:latest",
            stepName: "yarn-install-build",
            exitCode: 1,
            failureLog: "error: install failed",
            message: "",
            createdAt: "2026-07-02T12:34:00.000Z"
        });

        expect(text).toContain("CI pipeline failed");
        expect(text).toContain("yarn-install-build");
        expect(text).toContain("error: install failed");
    });
});
