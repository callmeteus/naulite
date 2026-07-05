import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../../../packages/control-plane/src/App";
import type { ControlPlaneContext } from "../../../packages/control-plane/src/ControlPlaneContext";

/**
 * Builds a control plane context with metrics mocks.
 *
 * @returns Mocked control plane context
 */
function createMetricsTestContext(): ControlPlaneContext {
    return {
        store: {
            listNodes: vi.fn(async () => [
                { id: "node-1", hostname: "node-1", status: "online" },
                { id: "node-2", hostname: "node-2", status: "offline" }
            ]),
            listServices: vi.fn(async () => [{ id: "svc-1", name: "web" }]),
            listInstances: vi.fn(async () => [
                { id: "inst-1", status: "running" },
                { id: "inst-2", status: "stopped" }
            ]),
            listVolumes: vi.fn(async () => [{ id: "vol-1", name: "data" }]),
            listSecrets: vi.fn(async () => [{ id: "secret-1", name: "db" }]),
            validateApiKey: vi.fn(async () => true),
            getClusterSecretValues: vi.fn(async () => ({}))
        },
        databaseProvider: {
            healthCheck: vi.fn(async () => true)
        },
        applyRevision: 3,
        leaderElection: {
            isLeader: () => true,
            getLeaderId: () => "cp-test"
        },
        netBirdEnrollment: {
            ensureSetupKey: vi.fn(async () => "setup-key")
        }
    } as unknown as ControlPlaneContext;
}

describe("metrics route", () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it("returns prometheus text exposition for local requests", async () => {
        const app = await createApp({
            context: createMetricsTestContext(),
            logger: false
        });

        const response = await app.inject({
            method: "GET",
            url: "/metrics",
            remoteAddress: "127.0.0.1"
        });

        expect(response.statusCode).toBe(200);
        expect(response.headers["content-type"]).toContain("text/plain");
        expect(response.body).toContain("naulite_nodes_total 2");
        expect(response.body).toContain("naulite_nodes_online 1");
        expect(response.body).toContain("naulite_instances_running 1");
        expect(response.body).toContain("naulite_apply_revision 3");
        expect(response.body).toContain("naulite_control_plane_leader");

        await app.close();
    });

    it("rejects remote metrics requests without authorization", async () => {
        const app = await createApp({
            context: createMetricsTestContext(),
            logger: false
        });

        const response = await app.inject({
            method: "GET",
            url: "/metrics",
            remoteAddress: "203.0.113.10"
        });

        expect(response.statusCode).toBe(401);

        await app.close();
    });
});
