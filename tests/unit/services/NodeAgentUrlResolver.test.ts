import { describe, expect, it } from "vitest";

import { NodeAgentUrlResolver } from "../../../packages/control-plane/src/services/NodeAgentUrlResolver";

describe("NodeAgentUrlResolver", () => {
    it("returns the registered URL when no ingress override is configured", () => {
        expect(NodeAgentUrlResolver.resolveControlPlaneFetchUrl("http://100.79.236.16:9470/"))
            .toBe("http://100.79.236.16:9470");
    });

    it("rewrites loopback and NetBird agent URLs through the dev ingress host", () => {
        const previousHost = process.env.NAULITE_AGENT_FETCH_VIA_HOST;
        process.env.NAULITE_AGENT_FETCH_VIA_HOST = "host.docker.internal";

        expect(NodeAgentUrlResolver.resolveControlPlaneFetchUrl("http://127.0.0.1:9470"))
            .toBe("http://host.docker.internal:9470");

        expect(NodeAgentUrlResolver.resolveControlPlaneFetchUrl("http://100.79.236.16:9470"))
            .toBe("http://host.docker.internal:9470");

        if (previousHost === undefined) {
            delete process.env.NAULITE_AGENT_FETCH_VIA_HOST;
        } else {
            process.env.NAULITE_AGENT_FETCH_VIA_HOST = previousHost;
        }
    });
});
