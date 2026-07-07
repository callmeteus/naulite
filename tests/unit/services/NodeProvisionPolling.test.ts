import { describe, expect, it, vi } from "vitest";

import type { ControlPlaneStore } from "../../../packages/control-plane/src/database/ControlPlaneStore";
import { NodeProvisionerRegistry } from "../../../packages/control-plane/src/plugins/NodeProvisionerRegistry";
import { NodeProvisionService } from "../../../packages/control-plane/src/services/NodeProvisionService";
import type { NetBirdEnrollmentService } from "../../../packages/control-plane/src/services/NetBirdEnrollmentService";

describe("NodeProvisionService status polling", () => {
    it("updates bootstrapping provisions when the cloud instance is running", async () => {
        const store = {
            listNodeProvisionsInFlight: vi.fn(async () => [{
                id: "provision-1",
                provider: "AWS",
                cloudInstanceId: "i-123",
                status: "launching",
                instanceType: "t3.micro",
                amiId: "ami-123",
                labels: {},
                capabilities: [],
                createdAt: "2026-07-02T00:00:00.000Z",
                updatedAt: "2026-07-02T00:00:00.000Z"
            }]),
            saveNodeProvision: vi.fn(async () => undefined)
        } as unknown as ControlPlaneStore;

        const registry = new NodeProvisionerRegistry();
        registry.register({
            id: "AWS",
            provision: vi.fn(),
            getStatus: vi.fn(async () => "running"),
            terminate: vi.fn()
        });

        const service = new NodeProvisionService(
            store,
            {} as NetBirdEnrollmentService,
            registry,
            () => "https://cp.example.com"
        );

        await service.pollActiveProvisions();

        expect(store.saveNodeProvision).toHaveBeenCalledWith(expect.objectContaining({
            id: "provision-1",
            status: "bootstrapping"
        }));
    });

    it("marks failed cloud instances as failed provisions", async () => {
        const store = {
            listNodeProvisionsInFlight: vi.fn(async () => [{
                id: "provision-2",
                provider: "AWS",
                cloudInstanceId: "i-456",
                status: "bootstrapping",
                instanceType: "t3.micro",
                amiId: "ami-123",
                labels: {},
                capabilities: [],
                createdAt: "2026-07-02T00:00:00.000Z",
                updatedAt: "2026-07-02T00:00:00.000Z"
            }]),
            saveNodeProvision: vi.fn(async () => undefined)
        } as unknown as ControlPlaneStore;

        const registry = new NodeProvisionerRegistry();
        registry.register({
            id: "AWS",
            provision: vi.fn(),
            getStatus: vi.fn(async () => "failed"),
            terminate: vi.fn()
        });

        const service = new NodeProvisionService(
            store,
            {} as NetBirdEnrollmentService,
            registry,
            () => "https://cp.example.com"
        );

        await service.pollActiveProvisions();

        expect(store.saveNodeProvision).toHaveBeenCalledWith(expect.objectContaining({
            id: "provision-2",
            status: "failed"
        }));
    });
});
