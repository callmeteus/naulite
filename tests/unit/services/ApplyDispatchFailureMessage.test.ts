import { describe, expect, it } from "vitest";

import type { AgentDispatchResult } from "../../../packages/control-plane/src/services/AgentDispatcher";
import {
    explainDispatchFailure,
    formatRolloutDispatchFailureMessage
} from "../../../packages/control-plane/src/services/ApplyDispatchFailureMessage";

function buildDispatch(overrides: Partial<AgentDispatchResult> = {}): AgentDispatchResult {
    return {
        nodeId: "dev-local",
        planId: "plan-1",
        agentUrl: "http://127.0.0.1:9470",
        status: "failed",
        ...overrides
    };
}

describe("ApplyDispatchFailureMessage", () => {
    it("explains JSON apply failures in plain language", () => {
        const message = explainDispatchFailure(buildDispatch({
            httpStatus: 500,
            message: "{\"accepted\":false,\"planId\":\"plan-1\",\"message\":\"apply failed\"}"
        }));

        expect(message).toBe("The node agent could not start or update the container.");
    });

    it("explains agent timeouts with the agent URL", () => {
        const message = explainDispatchFailure(buildDispatch({
            message: "Agent request timed out after 15000ms."
        }));

        expect(message).toContain("did not respond in time");
        expect(message).toContain("http://127.0.0.1:9470");
    });

    it("explains missing agent URLs", () => {
        const message = explainDispatchFailure(buildDispatch({
            status: "skipped",
            agentUrl: "",
            message: "Node has no agentUrl."
        }));

        expect(message).toBe("This node has no registered agent URL.");
    });

    it("formats a single-node rollout failure", () => {
        const message = formatRolloutDispatchFailureMessage([
            buildDispatch({
                message: "fetch failed"
            })
        ], ["dev-local"]);

        expect(message).toBe(
            "Rollout failed on node dev-local: The control plane could not connect to the agent at http://127.0.0.1:9470."
        );
    });

    it("formats multi-node rollout failures", () => {
        const message = formatRolloutDispatchFailureMessage([
            buildDispatch({
                nodeId: "dev-local",
                message: "fetch failed"
            }),
            buildDispatch({
                nodeId: "worker-1",
                agentUrl: "",
                status: "skipped",
                message: "Node has no agentUrl."
            })
        ], ["dev-local", "worker-1"]);

        expect(message).toContain("dev-local:");
        expect(message).toContain("worker-1:");
        expect(message).toContain("no registered agent URL");
    });
});
