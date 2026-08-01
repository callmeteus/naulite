import type { Instance } from "@naulite/shared";
import { describe, expect, it } from "vitest";

import { deriveServiceStatus } from "../../../packages/control-plane/src/services/DeriveServiceStatus";

function buildInstance(overrides: Partial<Instance> = {}): Instance {
    const now = new Date().toISOString();

    return {
        id: "minimal:web-1",
        serviceId: "minimal:web",
        serviceName: "web",
        nodeId: "dev-local",
        status: "pending",
        image: "nginx:1.27-alpine",
        createdAt: now,
        updatedAt: now,
        ...overrides
    };
}

describe("deriveServiceStatus", () => {
    it("marks the service running when desired replicas are healthy", () => {
        const status = deriveServiceStatus(
            { desiredReplicas: 1 },
            [buildInstance({ status: "running", containerId: "abc123" })]
        );

        expect(status).toBe("running");
    });

    it("marks the service deploying while instances are still rolling out", () => {
        const status = deriveServiceStatus(
            { desiredReplicas: 1 },
            [buildInstance({ status: "pending" })]
        );

        expect(status).toBe("deploying");
    });

    it("marks the service failed when every instance failed", () => {
        const status = deriveServiceStatus(
            { desiredReplicas: 1 },
            [buildInstance({ status: "failed", lastError: "pull failed" })]
        );

        expect(status).toBe("failed");
    });

    it("marks the service degraded when only part of the fleet is healthy", () => {
        const status = deriveServiceStatus(
            { desiredReplicas: 2 },
            [
                buildInstance({ id: "minimal:web-1", status: "running", containerId: "a" }),
                buildInstance({ id: "minimal:web-2", status: "failed", lastError: "start failed" })
            ]
        );

        expect(status).toBe("degraded");
    });
});
