import { describe, expect, it, vi } from "vitest";

import type { ControlPlaneStore } from "../../../packages/control-plane/src/database/ControlPlaneStore";
import { NodeProvisionerRegistry } from "../../../packages/control-plane/src/plugins/NodeProvisionerRegistry";
import { NodeProvisionService } from "../../../packages/control-plane/src/services/NodeProvisionService";
import type { NetBirdEnrollmentService } from "../../../packages/control-plane/src/services/NetBirdEnrollmentService";

describe("NodeProvisionService", () => {
    it("creates a provision record and launches a cloud instance", async () => {
        const saved: unknown[] = [];
        const store = {
            saveNodeProvision: vi.fn(async (provision) => {
                saved.push(provision);
            }),
            getClusterSecretValues: vi.fn(async () => null),
            upsertClusterSecret: vi.fn(async () => undefined),
            listNodeProvisions: vi.fn(async () => []),
            getNodeProvision: vi.fn(async () => null)
        } as unknown as ControlPlaneStore;

        const registry = new NodeProvisionerRegistry();
        registry.register({
            id: "aws",
            provision: vi.fn(async () => [{
                cloudInstanceId: "i-launched",
                status: "pending",
                region: "us-east-1"
            }]),
            getStatus: vi.fn(async () => "running"),
            terminate: vi.fn(async () => undefined)
        });

        const service = new NodeProvisionService(
            store,
            { ensureSetupKey: vi.fn(async () => "setup-key-test") } as NetBirdEnrollmentService,
            registry,
            () => "https://cp.example.com"
        );

        const provision = await service.provision({
            provider: "aws",
            instanceType: "t3.micro",
            amiId: "ami-123",
            labels: { role: "worker" },
            capabilities: ["docker"],
            count: 1,
            securityGroupIds: []
        });

        expect(provision.status).toBe("bootstrapping");
        expect(provision.cloudInstanceId).toBe("i-launched");
        expect(provision.nodeId).toBeTruthy();
        expect(store.upsertClusterSecret).toHaveBeenCalledWith(expect.objectContaining({
            name: expect.stringContaining("netbird/provision-setup-key/")
        }));
        expect(saved.length).toBeGreaterThanOrEqual(3);
    });

    it("marks a provision as registered after agent enrollment", async () => {
        const store = {
            getNodeProvision: vi.fn(async () => ({
                id: "provision-1",
                provider: "aws",
                cloudInstanceId: "i-1",
                status: "bootstrapping",
                instanceType: "t3.micro",
                amiId: "ami-123",
                labels: {},
                capabilities: [],
                createdAt: "2026-07-02T00:00:00.000Z",
                updatedAt: "2026-07-02T00:00:00.000Z"
            })),
            saveNodeProvision: vi.fn(async () => undefined)
        } as unknown as ControlPlaneStore;

        const service = new NodeProvisionService(
            store,
            {} as NetBirdEnrollmentService,
            new NodeProvisionerRegistry(),
            () => "https://cp.example.com"
        );

        const updated = await service.completeRegistration("provision-1", "node-99");

        expect(updated?.status).toBe("registered");
        expect(updated?.nodeId).toBe("node-99");
        expect(store.saveNodeProvision).toHaveBeenCalledWith(expect.objectContaining({
            id: "provision-1",
            status: "registered",
            nodeId: "node-99"
        }));
    });

    it("rejects unknown providers", async () => {
        const service = new NodeProvisionService(
            {
                saveNodeProvision: vi.fn(),
                getClusterSecretValues: vi.fn(async () => null),
                upsertClusterSecret: vi.fn()
            } as unknown as ControlPlaneStore,
            {} as NetBirdEnrollmentService,
            new NodeProvisionerRegistry(),
            () => "https://cp.example.com"
        );

        await expect(service.provision({
            provider: "missing",
            instanceType: "t3.micro",
            amiId: "ami-123",
            labels: {},
            capabilities: [],
            count: 1,
            securityGroupIds: []
        })).rejects.toMatchObject({
            message: "Unknown node provisioner provider: missing"
        });
    });

    it("validates provision-scoped setup keys", async () => {
        const store = {
            getClusterSecretValues: vi.fn(async (name: string) => {
                if (name === "netbird/provision-setup-key/provision-1") {
                    return { key: "secret-key" };
                }

                return null;
            })
        } as unknown as ControlPlaneStore;

        const service = new NodeProvisionService(
            store,
            {} as NetBirdEnrollmentService,
            new NodeProvisionerRegistry(),
            () => "https://cp.example.com"
        );

        await expect(service.validateProvisionSetupKey("provision-1", "secret-key")).resolves.toBe(true);
        await expect(service.validateProvisionSetupKey("provision-1", "wrong-key")).resolves.toBe(false);
    });
});
