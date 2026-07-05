import { describe, expect, it, vi } from "vitest";

import { SelfHostedNetBirdAdapter } from "../../../packages/control-plane/src/services/SelfHostedNetBirdAdapter";

describe("SelfHostedNetBirdAdapter", () => {
    it("creates a policy when ensurePolicy is called for a new name", async () => {
        const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
            if (url.endsWith("/policies") && init?.method === undefined) {
                return new Response(JSON.stringify({ items: [] }), { status: 200 });
            }

            if (url.endsWith("/policies") && init?.method === "POST") {
                return new Response(JSON.stringify({
                    id: "policy-1",
                    name: "naulite-network-demo",
                    rules: [{
                        id: "rule-1",
                        sources: ["group-1"],
                        destinations: ["group-1"],
                        ports: ["8080"],
                        protocol: "tcp"
                    }]
                }), { status: 200 });
            }

            return new Response("{}", { status: 404 });
        });

        const adapter = new SelfHostedNetBirdAdapter({
            apiUrl: "http://netbird/api",
            token: "token",
            fetchImpl
        });

        const acl = await adapter.ensurePolicy({
            name: "naulite-network-demo",
            sourceGroupIds: ["group-1"],
            destinationGroupIds: ["group-1"],
            ports: ["8080"]
        });

        expect(acl.id).toBe("rule-1");
        expect(acl.sourceGroups).toEqual(["group-1"]);
        expect(acl.destinationGroups).toEqual(["group-1"]);
    });

    it("assigns peers to an existing group with PUT", async () => {
        const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
            if (url.endsWith("/groups")) {
                return new Response(JSON.stringify({
                    items: [{ id: "group-1", name: "naulite-nodes", peers: ["peer-1"] }]
                }), { status: 200 });
            }

            if (url.endsWith("/groups/group-1") && init?.method === "PUT") {
                return new Response(JSON.stringify({
                    id: "group-1",
                    name: "naulite-nodes",
                    peers: ["peer-1", "peer-2"]
                }), { status: 200 });
            }

            return new Response("{}", { status: 404 });
        });

        const adapter = new SelfHostedNetBirdAdapter({
            apiUrl: "http://netbird/api",
            token: "token",
            fetchImpl
        });

        const group = await adapter.assignPeersToGroup("group-1", ["peer-2"]);

        expect(group.peers).toEqual(["peer-1", "peer-2"]);
    });
});
