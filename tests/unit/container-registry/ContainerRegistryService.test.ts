import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

import { afterEach, describe, expect, it } from "vitest";

import { DatabaseProvider } from "../../../packages/control-plane/src/database/DatabaseProvider";
import { ContainerRegistryService } from "../../../packages/control-plane/src/modules/container-registry/ContainerRegistryService";

describe("ContainerRegistryService", () => {
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
     * Creates a service backed by a temporary sqlite database.
     *
     * @returns Configured container registry service
     */
    async function createService(): Promise<ContainerRegistryService> {
        tempDir = await mkdtemp(path.join(os.tmpdir(), "platform-cr-"));
        databaseProvider = new DatabaseProvider();
        await databaseProvider.connect({
            dialect: "sqlite",
            url: `sqlite://${path.join(tempDir, "control-plane.db")}`
        });
        await databaseProvider.migrate();

        return new ContainerRegistryService({
            defaultDestination: {
                provider: "local",
                path: path.join(tempDir, "blobs")
            }
        });
    }

    it("stores and lists a docker save tarball in the local destination", async () => {
        const service = await createService();
        const payload = Buffer.from("docker-save-tarball-v1");
        const image = await service.putImage("app", "v1", Readable.from([payload]));

        expect(image.name).toBe("app");
        expect(image.tag).toBe("v1");
        expect(image.sizeBytes).toBe(payload.length);
        expect(image.digest).toMatch(/^sha256:[a-f0-9]{64}$/);

        const listed = await service.listImages();
        expect(listed).toHaveLength(1);
        expect(listed[0]?.location).toBe(image.location);

        const stored = await readFile(image.location);
        expect(stored.equals(payload)).toBe(true);
    });

    it("returns head metadata and streams an existing image", async () => {
        const service = await createService();
        const payload = Buffer.from("pull-me");
        const pushed = await service.putImage("worker", "latest", Readable.from([payload]));

        const head = await service.headImage("worker", "latest");
        expect(head?.sizeBytes).toBe(payload.length);
        expect(head?.digest).toBe(pushed.digest);

        const { stream } = await service.getImageStream("worker", "latest");
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }

        expect(Buffer.concat(chunks).equals(payload)).toBe(true);
    });

    it("deletes image metadata and the local blob", async () => {
        const service = await createService();
        const image = await service.putImage("app", "v2", Readable.from([Buffer.from("delete-me")]));

        expect(await service.deleteImage("app", "v2")).toBe(true);
        expect(await service.getImage("app", "v2")).toBeNull();

        await expect(readFile(image.location)).rejects.toThrow();
        expect(await service.deleteImage("app", "v2")).toBe(false);
    });
});
