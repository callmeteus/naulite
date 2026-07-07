import type { Instance } from "@naulite/shared";
import { describe, expect, it } from "vitest";

import { RolloutWatcher } from "../../../packages/control-plane/src/services/RolloutWatcher";

function buildInstance(status: Instance["status"]): Instance {
    const now = new Date().toISOString();
    return {
        id: "minimal:web-1",
        serviceId: "minimal:web",
        serviceName: "web",
        nodeId: "agent-1",
        status,
        image: "nginx:1.27-alpine",
        createdAt: now,
        updatedAt: now
    };
}

describe("RolloutWatcher", () => {
    it("treats running instances as rollout-ready without health data", () => {
        expect(RolloutWatcher.isInstanceRolloutReady(buildInstance("running"))).toBe(true);
    });

    it("does not treat pending instances as rollout-ready", () => {
        expect(RolloutWatcher.isInstanceRolloutReady(buildInstance("pending"))).toBe(false);
    });

    it("accepts healthy instances when health is reported", () => {
        const instance = buildInstance("pending");
        instance.health = {
            healthy: true,
            checkedAt: new Date().toISOString()
        };
        expect(RolloutWatcher.isInstanceRolloutReady(instance)).toBe(true);
    });
});
