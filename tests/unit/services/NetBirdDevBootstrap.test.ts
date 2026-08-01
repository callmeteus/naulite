import { describe, expect, it, vi } from "vitest";

import type { ControlPlaneContext } from "../../../packages/control-plane/src/ControlPlaneContext";
import type { ControlPlaneStore } from "../../../packages/control-plane/src/database/ControlPlaneStore";
import { NetBirdDevBootstrap } from "../../../packages/control-plane/src/services/NetBirdDevBootstrap";
import { MockNetBirdAdapter, NetBirdService } from "../../../packages/control-plane/src/services/NetBirdService";

describe("NetBirdDevBootstrap", () => {
    it("seeds mock mesh data and setup key during local development", async () => {
        process.env.NAULITE_NETBIRD_MOCK = "1";

        const adapter = new MockNetBirdAdapter();
        const store = {
            listNodes: vi.fn(async () => [{
                id: "dev-local",
                hostname: "dev-local",
                status: "online",
                lastSeenAt: new Date().toISOString()
            }]),
            saveNode: vi.fn(async () => undefined)
        } as unknown as ControlPlaneStore;

        const context = {
            netBirdAdapter: adapter,
            netBirdService: new NetBirdService(adapter),
            netBirdEnrollment: {
                ensureSetupKey: vi.fn(async () => "mock-setup-key-1")
            },
            store
        } as unknown as ControlPlaneContext;

        await NetBirdDevBootstrap.bootstrapIfNeeded(context);

        const topology = await context.netBirdService.getTopology();

        expect(topology.groups).toHaveLength(1);
        expect(topology.groups[0]?.name).toBe("naulite-nodes");
        expect(topology.devices).toHaveLength(1);
        expect(topology.devices[0]?.id).toBe("mock-peer-dev-local");
        expect(topology.acls).toHaveLength(1);
        expect(store.saveNode).toHaveBeenCalledWith(expect.objectContaining({
            id: "dev-local",
            netbirdDeviceId: "mock-peer-dev-local"
        }));
        expect(context.netBirdEnrollment.ensureSetupKey).toHaveBeenCalled();

        delete process.env.NAULITE_NETBIRD_MOCK;
    });

    it("skips bootstrap when the real NetBird adapter is enabled", async () => {
        delete process.env.NAULITE_NETBIRD_MOCK;

        const adapter = new MockNetBirdAdapter();
        const context = {
            netBirdAdapter: {
                listGroups: vi.fn()
            },
            netBirdService: new NetBirdService(adapter),
            netBirdEnrollment: {
                ensureSetupKey: vi.fn()
            },
            store: {
                listNodes: vi.fn()
            }
        } as unknown as ControlPlaneContext;

        await NetBirdDevBootstrap.bootstrapIfNeeded(context);

        expect(context.netBirdEnrollment.ensureSetupKey).not.toHaveBeenCalled();
    });
});
