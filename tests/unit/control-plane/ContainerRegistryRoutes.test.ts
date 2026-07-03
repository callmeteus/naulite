import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../../../packages/control-plane/src/App";
import type { ControlPlaneContext } from "../../../packages/control-plane/src/ControlPlaneContext";
import { DatabaseProvider } from "../../../packages/control-plane/src/database/DatabaseProvider";
import { ContainerRegistryService } from "../../../packages/control-plane/src/modules/container-registry/ContainerRegistryService";

describe("container registry routes", () => {
    let tempDir = "";
    let databaseProvider: DatabaseProvider | undefined;

    afterEach(async () => {
        if (databaseProvider) {
            await databaseProvider.disconnect().catch(() => undefined);
            databaseProvider = undefined;
        }

        if (tempDir) {
            await rm(tempDir, { recursive: true, force: true });
            tempDir = "";
        }
    });

    /**
     * Builds a test app with sqlite-backed container registry routes.
     *
     * @returns Fastify app and backing service
     */
    async function createRegistryApp() {
        tempDir = await mkdtemp(path.join(os.tmpdir(), "platform-cr-routes-"));
        databaseProvider = new DatabaseProvider();
        await databaseProvider.connect({
            dialect: "sqlite",
            url: `sqlite://${path.join(tempDir, "control-plane.db")}`
        });
        await databaseProvider.migrate();

        const containerRegistryService = new ContainerRegistryService({
            defaultDestination: {
                provider: "local",
                path: path.join(tempDir, "blobs")
            }
        });

        const context = {
            store: {
                validateApiKey: vi.fn(async (secret: string) => secret === "valid-secret"),
                getClusterSecretValues: vi.fn(async () => ({}))
            },
            containerRegistryService,
            netBirdEnrollment: {
                ensureSetupKey: vi.fn(async () => "setup-key-generated")
            }
        } as unknown as ControlPlaneContext;

        const app = await createApp({
            context,
            databaseProvider,
            logger: false
        });

        return { app, containerRegistryService };
    }

    it("rejects unauthenticated push requests", async () => {
        const { app } = await createRegistryApp();
        const response = await app.inject({
            method: "PUT",
            url: "/cr/images/app/v1",
            remoteAddress: "203.0.113.10",
            headers: {
                "content-type": "application/octet-stream"
            },
            payload: Buffer.from("tarball")
        });

        expect(response.statusCode).toBe(401);
    });

    it("proxies put, head, get, and delete for a stored image", async () => {
        const { app } = await createRegistryApp();
        const payload = Buffer.from("docker-save-tarball-v1");

        const pushResponse = await app.inject({
            method: "PUT",
            url: "/cr/images/app/v1",
            remoteAddress: "203.0.113.10",
            headers: {
                authorization: "Bearer valid-secret",
                "content-type": "application/octet-stream"
            },
            payload
        });

        expect(pushResponse.statusCode).toBe(201);
        expect(pushResponse.json().digest).toMatch(/^sha256:/);

        const headResponse = await app.inject({
            method: "HEAD",
            url: "/cr/images/app/v1",
            remoteAddress: "203.0.113.10",
            headers: {
                authorization: "Bearer valid-secret"
            }
        });

        expect(headResponse.statusCode).toBe(200);
        expect(headResponse.headers["content-length"]).toBe(String(payload.length));

        const getResponse = await app.inject({
            method: "GET",
            url: "/cr/images/app/v1",
            remoteAddress: "203.0.113.10",
            headers: {
                authorization: "Bearer valid-secret"
            }
        });

        expect(getResponse.statusCode).toBe(200);
        expect(getResponse.rawPayload).toEqual(payload);

        const listResponse = await app.inject({
            method: "GET",
            url: "/cr/images",
            remoteAddress: "203.0.113.10",
            headers: {
                authorization: "Bearer valid-secret"
            }
        });

        expect(listResponse.statusCode).toBe(200);
        expect(listResponse.json().images).toHaveLength(1);

        const deleteResponse = await app.inject({
            method: "DELETE",
            url: "/cr/images/app/v1",
            remoteAddress: "203.0.113.10",
            headers: {
                authorization: "Bearer valid-secret"
            }
        });

        expect(deleteResponse.statusCode).toBe(200);
        expect(deleteResponse.json()).toEqual({
            deleted: true,
            name: "app",
            tag: "v1"
        });
    });
});
