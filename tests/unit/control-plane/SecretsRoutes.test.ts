import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../../../packages/control-plane/src/App";
import type { ControlPlaneContext } from "../../../packages/control-plane/src/ControlPlaneContext";

/**
 * Builds a secrets route test context.
 *
 * @param options Context overrides
 * @returns Mocked control plane context
 */
function createSecretsTestContext(options: {
    isLeader?: boolean;
} = {}): ControlPlaneContext {
    const secrets = new Map<string, {
        id: string;
        name: string;
        keys: string[];
        scope: "cluster";
        createdAt: string;
        updatedAt: string;
    }>();

    return {
        instanceId: "cp-test",
        leaderElection: {
            isLeader: () => options.isLeader ?? true,
            getLeaderId: () => "cp-test",
            requireLeader: () => {
                if (!options.isLeader) {
                    throw new Error("not leader");
                }
            }
        },
        secretsService: {
            list: vi.fn(async () => [...secrets.values()]),
            getByName: vi.fn(async (name: string) => secrets.get(name) ?? null),
            upsert: vi.fn(async (input: { name: string; data: Record<string, string> }) => {
                const now = "2026-07-02T00:00:00.000Z";
                const metadata = {
                    id: `secret:${input.name}`,
                    name: input.name,
                    keys: Object.keys(input.data),
                    scope: "cluster" as const,
                    createdAt: secrets.get(input.name)?.createdAt ?? now,
                    updatedAt: now
                };
                secrets.set(input.name, metadata);
                return metadata;
            }),
            deleteByName: vi.fn(async (name: string) => secrets.delete(name)),
            resolveValues: vi.fn(async (name: string) => {
                if (!secrets.has(name)) {
                    return null;
                }

                return { token: "abc" };
            })
        },
        store: {
            validateApiKey: vi.fn(async (secret: string) => secret === "valid-secret")
        },
        controlPlaneSync: {
            publish: vi.fn(async () => null)
        },
        databaseProvider: {
            healthCheck: vi.fn(async () => true)
        }
    } as unknown as ControlPlaneContext;
}

describe("secrets routes", () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it("creates a secret on the leader", async () => {
        const context = createSecretsTestContext({ isLeader: true });
        const app = await createApp({ context, logger: false });

        const response = await app.inject({
            method: "POST",
            url: "/secrets",
            remoteAddress: "127.0.0.1",
            payload: {
                name: "db-credentials",
                data: {
                    username: "app",
                    password: "secret"
                }
            }
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual(expect.objectContaining({
            name: "db-credentials",
            keys: ["username", "password"]
        }));

        await app.close();
    });

    it("rejects secret writes from non-leader instances", async () => {
        const context = createSecretsTestContext({ isLeader: false });
        const app = await createApp({ context, logger: false });

        const response = await app.inject({
            method: "POST",
            url: "/secrets",
            remoteAddress: "127.0.0.1",
            payload: {
                name: "db-credentials",
                data: { password: "secret" }
            }
        });

        expect(response.statusCode).toBe(503);
        expect(response.json()).toEqual(expect.objectContaining({
            error: "not_leader"
        }));

        await app.close();
    });

    it("returns secret metadata by name", async () => {
        const context = createSecretsTestContext({ isLeader: true });
        const app = await createApp({ context, logger: false });

        await app.inject({
            method: "POST",
            url: "/secrets",
            remoteAddress: "127.0.0.1",
            payload: {
                name: "netbird/internal",
                data: { token: "abc" }
            }
        });

        const response = await app.inject({
            method: "GET",
            url: "/secrets/netbird%2Finternal",
            remoteAddress: "127.0.0.1"
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual(expect.objectContaining({
            name: "netbird/internal",
            keys: ["token"]
        }));

        await app.close();
    });

    it("reveals secret values by query name", async () => {
        const context = createSecretsTestContext({ isLeader: true });
        const app = await createApp({ context, logger: false });

        await app.inject({
            method: "POST",
            url: "/secrets",
            remoteAddress: "127.0.0.1",
            payload: {
                name: "netbird/internal",
                data: { token: "abc" }
            }
        });

        const response = await app.inject({
            method: "GET",
            url: "/secrets/reveal?name=netbird%2Finternal",
            remoteAddress: "127.0.0.1"
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
            name: "netbird/internal",
            data: { token: "abc" }
        });

        await app.close();
    });
});
