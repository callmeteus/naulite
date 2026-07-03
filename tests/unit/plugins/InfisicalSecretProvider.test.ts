import { describe, expect, it, vi } from "vitest";

import { InfisicalApiClient } from "../../../packages/plugins/infisical-secret-provider/src/InfisicalApiClient";
import {
    InfisicalSecretProvider
} from "../../../packages/plugins/infisical-secret-provider/src/index";

describe("InfisicalSecretProvider", () => {
    it("lists secrets as an empty stub when not configured", async () => {
        const provider = new InfisicalSecretProvider({
            apiUrl: "https://infisical.example",
            projectId: "project-1",
            environment: "dev"
        });

        await expect(provider.list()).resolves.toEqual([]);
    });

    it("rejects upsert until configured", async () => {
        const provider = new InfisicalSecretProvider();

        await expect(provider.upsert({
            name: "db",
            data: { password: "secret" }
        })).rejects.toThrow("Infisical secret provider is not configured");
    });

    it("lists, resolves, upserts, and deletes secrets through the Infisical API", async () => {
        const fetchImpl = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
            const url = String(input);
            const method = init?.method ?? "GET";

            if (method === "GET" && url.includes("/api/v3/secrets/raw?")) {
                return new Response(JSON.stringify({
                    secrets: [{
                        secretKey: "db",
                        secretValue: JSON.stringify({ password: "stored" }),
                        createdAt: "2026-01-01T00:00:00.000Z",
                        updatedAt: "2026-01-02T00:00:00.000Z"
                    }]
                }), { status: 200 });
            }

            if (method === "GET" && url.includes("/api/v3/secrets/raw/db")) {
                return new Response(JSON.stringify({
                    secret: {
                        secretKey: "db",
                        secretValue: JSON.stringify({ password: "stored" })
                    }
                }), { status: 200 });
            }

            if (method === "GET" && url.includes("/api/v3/secrets/raw/new-db")) {
                return new Response(JSON.stringify({ message: "missing" }), { status: 404 });
            }

            if (method === "POST" && url.endsWith("/api/v3/secrets/raw/new-db")) {
                return new Response(JSON.stringify({
                    secret: {
                        secretKey: "new-db",
                        secretValue: JSON.stringify({ user: "demo" }),
                        createdAt: "2026-01-03T00:00:00.000Z",
                        updatedAt: "2026-01-03T00:00:00.000Z"
                    }
                }), { status: 200 });
            }

            if (method === "DELETE" && url.endsWith("/api/v3/secrets/db")) {
                return new Response(JSON.stringify({ secret: { secretKey: "db" } }), { status: 200 });
            }

            throw new Error(`Unexpected fetch call: ${method} ${url}`);
        });

        const client = new InfisicalApiClient({
            apiUrl: "https://infisical.example",
            token: "st.test.token",
            projectId: "project-1",
            environment: "dev",
            fetchImpl
        });
        const provider = new InfisicalSecretProvider({ client });

        await expect(provider.list()).resolves.toEqual([
            expect.objectContaining({
                name: "db",
                keys: ["password"]
            })
        ]);

        await expect(provider.resolve("db")).resolves.toEqual({
            name: "db",
            data: { password: "stored" }
        });

        await expect(provider.upsert({
            name: "new-db",
            data: { user: "demo" }
        })).resolves.toEqual(expect.objectContaining({
            name: "new-db",
            keys: ["user"]
        }));

        await expect(provider.delete("db")).resolves.toBeUndefined();
        await expect(provider.resolveForAgent({ secretNames: ["db"] })).resolves.toEqual([
            { name: "db", data: { password: "stored" } }
        ]);
    });

    it("uses only the access-token portion of Infisical service tokens", async () => {
        const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ secrets: [] }), { status: 200 }));
        const client = new InfisicalApiClient({
            apiUrl: "https://infisical.example",
            token: "st.access.part",
            projectId: "project-1",
            environment: "dev",
            fetchImpl
        });

        await client.listSecrets();

        expect(fetchImpl).toHaveBeenCalledWith(
            expect.stringContaining("/api/v3/secrets/raw?"),
            expect.objectContaining({
                headers: expect.objectContaining({
                    Authorization: "Bearer st.access"
                })
            })
        );
    });
});
