import { describe, expect, it } from "vitest";

import { MockNetBirdAdapter, NetBirdService } from "../../../packages/control-plane/src/services/NetBirdService";

describe("NetBirdService", () => {
    it("ensures intra-group access policies for network groups", async () => {
        const adapter = new MockNetBirdAdapter();
        const service = new NetBirdService(adapter);
        const group = await adapter.ensureGroup("bookstore-internal");

        const acl = await service.ensureGroupAccessPolicy(group.id, "naulite-network-bookstore-internal", ["8080"]);

        expect(acl.name).toBe("naulite-network-bookstore-internal");
        expect(acl.sourceGroups).toEqual([group.id]);
        expect(acl.destinationGroups).toEqual([group.id]);
        expect(acl.ports).toEqual([8080]);
    });

    it("syncs registered node peers into the naulite-nodes group", async () => {
        const adapter = new MockNetBirdAdapter();
        const service = new NetBirdService(adapter);

        const group = await service.syncPlatformNodePeers(["peer-1", "peer-2", "peer-1"]);

        expect(group.name).toBe("naulite-nodes");
        expect(group.peers).toEqual(["peer-1", "peer-2"]);
    });

    it("skips peer sync when no device ids are available", async () => {
        const adapter = new MockNetBirdAdapter();
        const service = new NetBirdService(adapter);

        const group = await service.syncPlatformNodePeers([]);

        expect(group.name).toBe("naulite-nodes");
        expect(group.peers).toEqual([]);
    });

    it("bootstraps a default dev mesh with groups, devices, and ACLs", async () => {
        const adapter = new MockNetBirdAdapter();

        await adapter.bootstrapDevMesh([{
            deviceId: "mock-peer-dev-local",
            hostname: "dev-local"
        }]);

        const groups = await adapter.listGroups();
        const devices = await adapter.listDevices();
        const acls = await adapter.listAcls();

        expect(groups).toHaveLength(1);
        expect(devices).toHaveLength(1);
        expect(acls).toHaveLength(1);
        expect(devices[0]?.online).toBe(true);
    });
});
