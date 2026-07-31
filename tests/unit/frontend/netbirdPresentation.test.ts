import { describe, expect, it } from "vitest";

import type { NetBirdAcl, NetBirdDevice, NetBirdGroup, Node } from "@naulite/sdk";

import {
    countOnlineNetBirdDevices,
    findLinkedNode,
    formatNetBirdGroupRefs,
    isNetBirdDeviceOnline,
    listUnlinkedNodes,
    resolveNetBirdGroupName
} from "../../../packages/ui/packages/frontend/src/utils/netbirdPresentation";

const groups: NetBirdGroup[] = [
    { id: "group-1", name: "naulite-nodes", peers: ["device-1"] }
];

const nodes: Node[] = [
    {
        id: "dev-local",
        hostname: "desktop",
        status: "online",
        labels: {},
        capabilities: [],
        resources: {
            cpuMillisTotal: 1000,
            cpuMillisUsed: 0,
            memoryMbTotal: 1024,
            memoryMbUsed: 0,
            diskMbTotal: 102400,
            diskMbUsed: 0
        },
        agentVersion: "zig-0.1.0",
        netbirdDeviceId: "device-1",
        lastHeartbeatAt: "2026-07-31T21:00:00.000Z",
        createdAt: "2026-07-31T20:00:00.000Z",
        updatedAt: "2026-07-31T21:00:00.000Z"
    },
    {
        id: "node-2",
        hostname: "worker",
        status: "online",
        labels: {},
        capabilities: [],
        resources: {
            cpuMillisTotal: 1000,
            cpuMillisUsed: 0,
            memoryMbTotal: 1024,
            memoryMbUsed: 0,
            diskMbTotal: 102400,
            diskMbUsed: 0
        },
        agentVersion: "zig-0.1.0",
        lastHeartbeatAt: "2026-07-31T21:00:00.000Z",
        createdAt: "2026-07-31T20:00:00.000Z",
        updatedAt: "2026-07-31T21:00:00.000Z"
    }
];

describe("netbirdPresentation", () => {
    it("resolves device online state from online or connected fields", () => {
        expect(isNetBirdDeviceOnline({ id: "a", name: "a", online: true })).toBe(true);
        expect(isNetBirdDeviceOnline({ id: "b", name: "b", connected: true })).toBe(true);
        expect(isNetBirdDeviceOnline({ id: "c", name: "c" })).toBe(false);
    });

    it("maps group ids to names and links nodes", () => {
        expect(resolveNetBirdGroupName("group-1", groups)).toBe("naulite-nodes");
        expect(findLinkedNode("device-1", nodes)?.id).toBe("dev-local");
        expect(listUnlinkedNodes(nodes).map((node) => node.id)).toEqual(["node-2"]);
    });

    it("counts online devices and formats ACL group refs", () => {
        const devices: NetBirdDevice[] = [
            { id: "1", name: "one", online: true },
            { id: "2", name: "two", online: false }
        ];
        const acl: NetBirdAcl = {
            id: "acl-1",
            sourceGroups: ["group-1"],
            destinationGroups: ["group-1"]
        };

        expect(countOnlineNetBirdDevices(devices)).toBe(1);
        expect(formatNetBirdGroupRefs(acl.sourceGroups, groups)).toBe("naulite-nodes");
    });
});
