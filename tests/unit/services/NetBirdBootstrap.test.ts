import { describe, expect, it, vi } from "vitest";

import { ControlPlaneStore } from "../../../packages/control-plane/src/database/ControlPlaneStore.js";
import {
    NETBIRD_INTERNAL_SECRET_NAME,
    NetBirdBootstrap
} from "../../../packages/control-plane/src/services/NetBirdBootstrap.js";

describe("NetBirdBootstrap", () => {
    it("returns stored credentials without calling NetBird setup", async () => {
        const store = {
            getClusterSecretValues: vi.fn(async () => ({
                apiToken: "nbp_cached",
                superadminEmail: "superadmin@platform.internal",
                superadminPassword: "cached-password"
            })),
            upsertClusterSecret: vi.fn()
        } as unknown as ControlPlaneStore;

        const credentials = await NetBirdBootstrap.ensureCredentials(store, {
            apiUrl: "http://netbird-server/api"
        });

        expect(credentials.apiToken).toBe("nbp_cached");
        expect(store.upsertClusterSecret).not.toHaveBeenCalled();
    });

    it("bootstraps NetBird and stores internal credentials on first run", async () => {
        const upsertClusterSecret = vi.fn(async () => undefined);
        const store = {
            getClusterSecretValues: vi.fn(async () => null),
            upsertClusterSecret
        } as unknown as ControlPlaneStore;

        const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
            if (url.endsWith("/instance")) {
                return new Response(JSON.stringify({ setup_required: true }), { status: 200 });
            }

            if (url.endsWith("/setup") && init?.method === "POST") {
                return new Response(JSON.stringify({
                    user_id: "user-1",
                    email: "superadmin@platform.internal",
                    personal_access_token: "nbp_generated"
                }), { status: 200 });
            }

            return new Response("not found", { status: 404 });
        });

        const credentials = await NetBirdBootstrap.ensureCredentials(store, {
            apiUrl: "http://netbird-server/api",
            fetchImpl
        });

        expect(credentials.apiToken).toBe("nbp_generated");
        expect(credentials.superadminPassword.length).toBeGreaterThanOrEqual(8);
        expect(upsertClusterSecret).toHaveBeenCalledWith(expect.objectContaining({
            name: NETBIRD_INTERNAL_SECRET_NAME,
            keys: ["apiToken", "superadminEmail", "superadminPassword"]
        }));
    });

    it("uses credentials written by another control plane after setup race", async () => {
        let stored: Record<string, string> | null = null;
        const store = {
            getClusterSecretValues: vi.fn(async () => stored),
            upsertClusterSecret: vi.fn(async (input: { value: Record<string, string> }) => {
                stored = input.value;
            })
        } as unknown as ControlPlaneStore;

        const fetchImpl = vi.fn(async (url: string) => {
            if (url.endsWith("/instance")) {
                return new Response(JSON.stringify({ setup_required: true }), { status: 200 });
            }

            if (url.endsWith("/setup")) {
                stored = {
                    apiToken: "nbp_from_peer",
                    superadminEmail: "superadmin@platform.internal",
                    superadminPassword: "peer-password"
                };
                return new Response(JSON.stringify({ message: "setup already completed" }), { status: 409 });
            }

            return new Response("not found", { status: 404 });
        });

        const credentials = await NetBirdBootstrap.ensureCredentials(store, {
            apiUrl: "http://netbird-server/api",
            fetchImpl
        });

        expect(credentials.apiToken).toBe("nbp_from_peer");
    });
});
