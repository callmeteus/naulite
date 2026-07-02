import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { S3BackupDestinationProvider } from "@platform/plugin-s3";
import type { BackupTask } from "@platform/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

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
