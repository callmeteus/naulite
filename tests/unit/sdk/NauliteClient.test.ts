import { describe, expect, it, vi } from "vitest";

import { NauliteClient } from "../../../packages/sdk/src/NauliteClient";

describe("NauliteClient", () => {
    it("upserts secrets through the control plane API", async () => {
        const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
            id: "secret:db",
            name: "db",
            keys: ["password"],
            scope: "cluster",
            createdAt: "2026-07-02T00:00:00.000Z",
            updatedAt: "2026-07-02T00:00:00.000Z"
        }), { status: 200 }));

        const client = new NauliteClient({
            baseUrl: "http://localhost:8080",
            fetchImpl
        });

        const secret = await client.upsertSecret({
            name: "db",
            data: { password: "secret-value" }
        });

        expect(secret.name).toBe("db");
        expect(fetchImpl).toHaveBeenCalledWith(
            "http://localhost:8080/secrets",
            expect.objectContaining({ method: "POST" })
        );
    });

    it("lists NetBird devices from the wrapped response payload", async () => {
        const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
            devices: [{ id: "dev-1", name: "agent-1", connected: true }]
        }), { status: 200 }));

        const client = new NauliteClient({
            baseUrl: "http://localhost:8080",
            fetchImpl
        });

        const devices = await client.listNetBirdDevices();

        expect(devices).toEqual([{ id: "dev-1", name: "agent-1", connected: true }]);
    });

    it("returns prometheus metrics as plain text", async () => {
        const fetchImpl = vi.fn(async () => new Response("naulite_nodes_total 1\n", {
            status: 200,
            headers: { "Content-Type": "text/plain" }
        }));

        const client = new NauliteClient({
            baseUrl: "http://localhost:8080",
            fetchImpl
        });

        const metrics = await client.getPrometheusMetrics();

        expect(metrics).toBe("naulite_nodes_total 1\n");
        expect(fetchImpl).toHaveBeenCalledWith(
            "http://localhost:8080/metrics",
            expect.objectContaining({ method: "GET" })
        );
    });

    it("lists container registry images from the wrapped response payload", async () => {
        const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
            images: [{
                name: "api",
                tag: "latest",
                digest: "sha256:abc",
                sizeBytes: 1024,
                destination: { provider: "local", path: "/var/lib/naulite/cr" },
                location: "/var/lib/naulite/cr/api/latest.tar",
                pushedAt: "2026-07-02T00:00:00.000Z"
            }]
        }), { status: 200 }));

        const client = new NauliteClient({
            baseUrl: "http://localhost:8080",
            fetchImpl
        });

        const images = await client.listContainerRegistryImages();

        expect(images).toHaveLength(1);
        expect(images[0]?.name).toBe("api");
        expect(fetchImpl).toHaveBeenCalledWith(
            "http://localhost:8080/cr/images",
            expect.objectContaining({ method: "GET" })
        );
    });

    it("reads container registry image metadata from HEAD response headers", async () => {
        const fetchImpl = vi.fn(async () => new Response(null, {
            status: 200,
            headers: {
                Digest: "sha256:abc",
                "Content-Length": "2048",
                "Content-Type": "application/octet-stream"
            }
        }));

        const client = new NauliteClient({
            baseUrl: "http://localhost:8080",
            fetchImpl
        });

        const head = await client.headContainerRegistryImage("api", "latest");

        expect(head).toEqual({
            digest: "sha256:abc",
            sizeBytes: 2048,
            contentType: "application/octet-stream"
        });
        expect(fetchImpl).toHaveBeenCalledWith(
            "http://localhost:8080/cr/images/api/latest",
            expect.objectContaining({ method: "HEAD" })
        );
    });

    it("deletes container registry images through the control plane API", async () => {
        const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
            deleted: true,
            name: "api",
            tag: "latest"
        }), { status: 200 }));

        const client = new NauliteClient({
            baseUrl: "http://localhost:8080",
            fetchImpl
        });

        const result = await client.deleteContainerRegistryImage("api", "latest");

        expect(result).toEqual({ deleted: true, name: "api", tag: "latest" });
        expect(fetchImpl).toHaveBeenCalledWith(
            "http://localhost:8080/cr/images/api/latest",
            expect.objectContaining({ method: "DELETE" })
        );
    });

    it("triggers builds through the control plane API", async () => {
        const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
            buildId: "build-1",
            status: "queued"
        }), { status: 200 }));

        const client = new NauliteClient({
            baseUrl: "http://localhost:8080",
            fetchImpl
        });

        const result = await client.triggerBuild({ serviceName: "api", provider: "docker" });

        expect(result).toEqual({ buildId: "build-1", status: "queued" });
        expect(fetchImpl).toHaveBeenCalledWith(
            "http://localhost:8080/build",
            expect.objectContaining({ method: "POST" })
        );
    });

    it("provisions nodes through the control plane API", async () => {
        const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
            id: "provision-1",
            provider: "AWS",
            status: "bootstrapping",
            instanceType: "t3.small",
            amiId: "ami-123",
            labels: {},
            capabilities: [],
            createdAt: "2026-07-02T00:00:00.000Z",
            updatedAt: "2026-07-02T00:00:00.000Z"
        }), { status: 200 }));

        const client = new NauliteClient({
            baseUrl: "http://localhost:8080",
            fetchImpl
        });

        const provision = await client.provisionNode({
            instanceType: "t3.small",
            amiId: "ami-123"
        });

        expect(provision.id).toBe("provision-1");
        expect(fetchImpl).toHaveBeenCalledWith(
            "http://localhost:8080/nodes/provision",
            expect.objectContaining({ method: "POST" })
        );
    });

    it("sends CSRF header on mutating BFF requests when configured", async () => {
        const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));

        const client = new NauliteClient({
            baseUrl: "http://localhost:3001/api",
            credentials: "include",
            csrfToken: "csrf-token-abc",
            fetchImpl
        });

        await client.login({ email: "admin@example.com", password: "secret" });

        expect(fetchImpl).toHaveBeenCalledWith(
            "http://localhost:3001/api/auth/login",
            expect.objectContaining({
                method: "POST",
                headers: expect.objectContaining({
                    "x-csrf-token": "csrf-token-abc"
                })
            })
        );
    });

    it("uses a wrapped default fetch when fetchImpl is omitted", async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({
            user: {
                id: "user-1",
                email: "admin@example.com",
                role: "admin",
                tenantId: null,
                disabledAt: null,
                createdAt: "2026-07-02T00:00:00.000Z",
                updatedAt: "2026-07-02T00:00:00.000Z"
            },
            csrfToken: "csrf-token-default"
        }), { status: 200 }));

        vi.stubGlobal("fetch", fetchMock);

        try {
            const client = new NauliteClient({
                baseUrl: "http://localhost:3001/api",
                credentials: "include"
            });

            const response = await client.login({ email: "admin@example.com", password: "secret" });

            expect(response.csrfToken).toBe("csrf-token-default");
            expect(fetchMock).toHaveBeenCalledWith(
                "http://localhost:3001/api/auth/login",
                expect.objectContaining({ method: "POST" })
            );
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("calls host inventory and update endpoints", async () => {
        const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
            const method = init?.method ?? "GET";

            if (method === "GET" && String(_url).includes("/host/inventory")) {
                return new Response(JSON.stringify({
                    nodeId: "node-1",
                    packageManager: "apt",
                    packages: [],
                    summary: { total: 0, outdated: 0 },
                    collectedAt: "2026-07-30T00:00:00.000Z"
                }), { status: 200 });
            }

            if (method === "POST" && String(_url).includes("/host/packages/update")) {
                return new Response(JSON.stringify({
                    id: "run-1",
                    nodeId: "node-1",
                    kind: "packages",
                    status: "succeeded",
                    packages: ["openssl"],
                    rebootRequired: false,
                    createdAt: "2026-07-30T00:00:00.000Z"
                }), { status: 200 });
            }

            return new Response("{}", { status: 404 });
        });

        const client = new NauliteClient({
            baseUrl: "http://localhost:8080",
            fetchImpl
        });

        const inventory = await client.getNodeHostInventory("node-1", { refresh: true });
        expect(inventory.nodeId).toBe("node-1");

        const run = await client.updateNodePackages("node-1", ["openssl"]);
        expect(run.kind).toBe("packages");

        expect(fetchImpl).toHaveBeenCalledWith(
            "http://localhost:8080/nodes/node-1/host/inventory?refresh=true",
            expect.objectContaining({ method: "GET" })
        );

        fetchImpl.mockImplementationOnce(async () => new Response(JSON.stringify({
            nodeId: "node-1",
            packageManager: "apt",
            summary: { total: 2, outdated: 1 },
            collectedAt: "2026-07-30T00:00:00.000Z",
            status: "outdated",
            items: [],
            total: 1,
            page: 2,
            limit: 50,
            hasMore: false
        }), { status: 200 }));

        const page = await client.getNodeHostPackages("node-1", {
            page: 2,
            limit: 50,
            status: "outdated"
        });
        expect(page.total).toBe(1);
        expect(fetchImpl).toHaveBeenCalledWith(
            "http://localhost:8080/nodes/node-1/host/packages?page=2&limit=50&status=outdated",
            expect.objectContaining({ method: "GET" })
        );
        expect(fetchImpl).toHaveBeenCalledWith(
            "http://localhost:8080/nodes/node-1/host/packages/update",
            expect.objectContaining({ method: "POST" })
        );
    });

    it("accepts already-normalized apply responses from the admin BFF", async () => {
        const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
            revision: 2,
            manifestName: "minimal",
            servicesCreated: 1,
            servicesUpdated: 0,
            servicesDeleted: 0,
            runId: "minimal-apply-e5a96"
        }), { status: 200 }));

        const client = new NauliteClient({
            baseUrl: "http://localhost:3001",
            fetchImpl
        });

        const result = await client.applyManifest("name: minimal\nservices:\n  web:\n    image: nginx");

        expect(result.servicesCreated).toBe(1);
        expect(result.runId).toBe("minimal-apply-e5a96");
    });
});
