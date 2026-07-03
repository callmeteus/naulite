import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

import { PutObjectCommand } from "@aws-sdk/client-s3";
import type { BackupTask } from "@platform/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@platform/control-plane", () => {
    class BackupDestinationProvider {
        readonly id = "mock-backup";
    }

    class ContainerRegistryBlobProvider {
        readonly id = "mock-cr";
    }

    return { BackupDestinationProvider, ContainerRegistryBlobProvider };
});

import { S3BackupDestinationProvider } from "../../../../packages/plugins/s3-storage-provider/src/S3BackupDestinationProvider";
import { S3ContainerRegistryBlobProvider } from "../../../../packages/plugins/s3-storage-provider/src/S3ContainerRegistryBlobProvider";

describe("S3BackupDestinationProvider", () => {
    let tempDir = "";

    afterEach(async () => {
        if (tempDir) {
            await rm(tempDir, { recursive: true, force: true });
            tempDir = "";
        }
    });

    it("uploads a backup archive through a mocked S3 client", async () => {
        tempDir = await mkdtemp(path.join(os.tmpdir(), "platform-s3-backup-"));
        const archivePath = path.join(tempDir, "source.tar.gz");
        await writeFile(archivePath, "s3-backup-payload");

        const send = vi.fn().mockResolvedValue({});
        const provider = new S3BackupDestinationProvider({
            client: { send } as never
        });
        const task: BackupTask = {
            taskId: "task-s3-1",
            volumeId: "minimal:data",
            volumeName: "data",
            nodeId: "node-a",
            destination: {
                provider: "s3",
                bucket: "platform-backups",
                prefix: "daily",
                region: "us-east-1",
                credentialsSecret: {
                    secretName: "s3-creds"
                }
            },
            resolvedSecrets: {
                "s3-creds": "configured"
            }
        };

        const result = await provider.write(task, archivePath);

        expect(send).toHaveBeenCalledTimes(1);
        expect(send.mock.calls[0]?.[0]).toBeInstanceOf(PutObjectCommand);
        expect(result.location).toBe("s3://platform-backups/daily/data-task-s3-1.tar.gz");
        expect(result.sizeBytes).toBe(Buffer.byteLength("s3-backup-payload"));
        expect(await provider.validate(task)).toBe(true);
    });

    it("rejects tasks that target a different provider", async () => {
        const provider = new S3BackupDestinationProvider({
            client: { send: vi.fn() } as never
        });
        const task: BackupTask = {
            taskId: "task-s3-2",
            volumeId: "minimal:data",
            volumeName: "data",
            nodeId: "node-a",
            destination: {
                provider: "local",
                path: "/tmp/backups"
            },
            resolvedSecrets: {}
        };

        await expect(provider.write(task, "/tmp/missing.tar.gz")).rejects.toThrow(
            "S3BackupDestinationProvider cannot handle provider local"
        );
        expect(await provider.validate(task)).toBe(false);
    });
});

describe("S3ContainerRegistryBlobProvider", () => {
    it("uploads a docker save tarball through a mocked S3 client", async () => {
        const send = vi.fn().mockResolvedValue({
            ContentLength: 18
        });
        const provider = new S3ContainerRegistryBlobProvider({
            client: { send } as never
        });

        await provider.writeStream({
            name: "app",
            tag: "v1",
            destination: {
                provider: "s3",
                bucket: "platform-cr",
                prefix: "cluster-a",
                region: "us-east-1",
                credentialsSecret: {
                    secretName: "s3-creds"
                }
            },
            body: Readable.from([Buffer.from("docker-save-tarball")]),
            resolvedSecrets: {
                "s3-creds": "configured"
            }
        });

        expect(send).toHaveBeenCalled();
        expect(send.mock.calls.some((call) => call[0] instanceof PutObjectCommand)).toBe(true);
    });

    it("rejects destinations that are not s3", async () => {
        const provider = new S3ContainerRegistryBlobProvider({
            client: { send: vi.fn() } as never
        });

        await expect(provider.writeStream({
            name: "app",
            tag: "v1",
            destination: {
                provider: "local",
                path: "/tmp/cr"
            },
            body: Readable.from([Buffer.from("payload")]),
            resolvedSecrets: {}
        })).rejects.toThrow("S3ContainerRegistryBlobProvider cannot handle provider local");
    });
});
