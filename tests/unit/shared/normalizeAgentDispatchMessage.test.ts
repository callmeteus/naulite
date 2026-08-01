import { describe, expect, it } from "vitest";

import {
    formatAgentHttpFailureMessage,
    normalizeAgentDispatchMessage
} from "../../../packages/nodejs/shared/src/util/normalizeAgentDispatchMessage";

describe("normalizeAgentDispatchMessage", () => {
    it("unwraps JSON agent failure bodies", () => {
        expect(normalizeAgentDispatchMessage(
            "{\"accepted\":false,\"planId\":\"minimal-dev-local-10\",\"message\":\"apply failed\"}"
        )).toBe("The node agent could not start or update the container.");
    });

    it("formats HTTP failures from JSON bodies", () => {
        expect(formatAgentHttpFailureMessage(
            500,
            "{\"accepted\":false,\"planId\":\"plan-1\",\"message\":\"apply failed\"}"
        )).toBe("The node agent could not start or update the container.");
    });

    it("preserves docker error details", () => {
        expect(normalizeAgentDispatchMessage("Docker operation failed: ImageNotFound"))
            .toBe("Docker operation failed: ImageNotFound");
    });

    it("humanizes fetch failed", () => {
        expect(normalizeAgentDispatchMessage("fetch failed"))
            .toBe("The control plane could not connect to the agent.");
    });
});
