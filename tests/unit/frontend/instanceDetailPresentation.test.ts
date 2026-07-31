import { describe, expect, it } from "vitest";

import type { Instance } from "@naulite/sdk";

import {
    isAgentRelatedApiError,
    isAgentRelatedText,
    resolveInstanceIssueKey,
    shouldFetchInstanceLogs
} from "../../../packages/ui/packages/frontend/src/utils/instanceDetailPresentation";

function buildInstance(overrides: Partial<Instance> = {}): Instance {
    return {
        id: "minimal:web-1",
        serviceId: "minimal:web",
        serviceName: "web",
        nodeId: "dev-local",
        image: "nginx:1.27-alpine",
        status: "failed",
        createdAt: "2026-07-31T21:31:15.000Z",
        updatedAt: "2026-07-31T21:48:05.000Z",
        ...overrides
    };
}

describe("instanceDetailPresentation", () => {
    it("detects agent-related failures", () => {
        expect(isAgentRelatedText("fetch failed")).toBe(true);
        expect(isAgentRelatedText("Could not forward the request to the agent.")).toBe(true);
        expect(isAgentRelatedText("image pull failed")).toBe(false);
    });

    it("skips automatic logs when the container never started", () => {
        const instance = buildInstance({
            containerId: undefined,
            status: "failed",
            lastError: "fetch failed"
        });

        expect(shouldFetchInstanceLogs(instance)).toBe(false);
        expect(resolveInstanceIssueKey(instance)).toBe("pages.instanceDetail.issueAgentOffline");
    });

    it("fetches logs for running instances", () => {
        const instance = buildInstance({
            status: "running",
            containerId: "abc123"
        });

        expect(shouldFetchInstanceLogs(instance)).toBe(true);
        expect(resolveInstanceIssueKey(instance)).toBeUndefined();
    });

    it("maps parsed agent API errors", () => {
        expect(isAgentRelatedApiError({
            message: "ignored",
            i18n: "errors.agentForwardFailed"
        })).toBe(true);
    });
});
