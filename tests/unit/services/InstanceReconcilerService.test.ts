import type { Instance, Node } from "@naulite/shared";
import { describe, expect, it } from "vitest";

import { InstanceReconcilerService } from "../../../packages/control-plane/src/services/InstanceReconcilerService";

function buildNode(overrides: Partial<Node> = {}): Node {
    const now = new Date().toISOString();
    return {
        id: "agent-1",
        hostname: "agent-1",
        status: "online",
        labels: {},
        capabilities: [],
        resources: {
            cpuMillisTotal: 4000,
            cpuMillisUsed: 0,
            memoryMbTotal: 8192,
            memoryMbUsed: 0,
            diskMbTotal: 102400,
            diskMbUsed: 0
        },
        agentVersion: "0.1.0",
        agentUrl: "http://agent-1:9470",
        lastHeartbeatAt: now,
        createdAt: now,
        updatedAt: now,
        ...overrides
    };
}

function buildInstance(overrides: Partial<Instance> = {}): Instance {
    const now = new Date().toISOString();
    return {
        id: "minimal:web-1",
        serviceId: "minimal:web",
        serviceName: "web",
        nodeId: "agent-1",
        status: "pending",
        image: "nginx:1.27-alpine",
        createdAt: now,
        updatedAt: now,
        ...overrides
    };
}

describe("InstanceReconcilerService", () => {
    it("selects pending instances on online nodes after backoff elapsed", () => {
        const stale = new Date(Date.now() - 60_000).toISOString();
        const instance = buildInstance({
            status: "pending",
            updatedAt: stale,
            lastDispatchedAt: stale
        });

        expect(InstanceReconcilerService.isReconcileCandidate(
            instance,
            [buildNode()],
            new Date()
        )).toBe(true);
    });

    it("skips instances that exceeded max retries", () => {
        const instance = buildInstance({
            status: "failed",
            dispatchAttempts: InstanceReconcilerService.resolveMaxRetries()
        });

        expect(InstanceReconcilerService.isReconcileCandidate(
            instance,
            [buildNode()],
            new Date()
        )).toBe(false);
    });

    it("skips instances on nodes without agentUrl", () => {
        const stale = new Date(Date.now() - 60_000).toISOString();
        const instance = buildInstance({
            status: "failed",
            updatedAt: stale,
            lastDispatchedAt: stale
        });

        expect(InstanceReconcilerService.isReconcileCandidate(
            instance,
            [buildNode({ agentUrl: undefined })],
            new Date()
        )).toBe(false);
    });

    it("uses exponential backoff between attempts", () => {
        expect(InstanceReconcilerService.reconcileBackoffMs(0)).toBe(15_000);
        expect(InstanceReconcilerService.reconcileBackoffMs(1)).toBe(30_000);
        expect(InstanceReconcilerService.reconcileBackoffMs(2)).toBe(60_000);
    });

    it("allows forced reconciliation before backoff elapses", () => {
        const now = new Date().toISOString();
        const instance = buildInstance({
            status: "failed",
            updatedAt: now,
            lastDispatchedAt: now
        });

        expect(InstanceReconcilerService.isReconcileCandidate(
            instance,
            [buildNode()],
            new Date(),
            { force: true }
        )).toBe(true);
    });
});
