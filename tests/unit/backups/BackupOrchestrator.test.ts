import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { BackupOrchestrator } from "@platform/backups";
import type { BackupTask } from "@platform/shared";
import { afterEach, describe, expect, it } from "vitest";

describe("BackupOrchestrator", () => {
    let tempDir = "";

    afterEach(async () => {
        if (tempDir) {
            await rm(tempDir, { recursive: true, force: true });
            tempDir = "";
        }
    });

    it("writes a backup archive through the built-in local provider", async () => {
        tempDir = await mkdtemp(path.join(os.tmpdir(), "platform-backup-"));
        const archivePath = path.join(tempDir, "source.tar.gz");
        const destinationDir = path.join(tempDir, "backups");
        await writeFile(archivePath, "backup-payload");

        const orchestrator = new BackupOrchestrator();
        const task: BackupTask = {
            taskId: "task-1",
            volumeId: "minimal:data",
            volumeName: "data",
            nodeId: "node-a",
            destination: {
                provider: "local",
                path: destinationDir
            },
            resolvedSecrets: {}
        };

        const result = await orchestrator.write(task, archivePath);

        expect(result.provider).toBe("local");
        expect(result.taskId).toBe("task-1");
        expect(result.location).toContain(destinationDir);
        await expect(readFile(result.location, "utf8")).resolves.toBe("backup-payload");
        expect(await orchestrator.validate(task)).toBe(true);
    });

    it("throws when the destination provider is not registered", async () => {
        tempDir = await mkdtemp(path.join(os.tmpdir(), "platform-backup-"));
        const archivePath = path.join(tempDir, "source.tar.gz");
        await writeFile(archivePath, "backup-payload");

        const orchestrator = new BackupOrchestrator();
        const task: BackupTask = {
            taskId: "task-2",
            volumeId: "minimal:data",
            volumeName: "data",
            nodeId: "node-a",
            destination: {
                provider: "s3",
                bucket: "backups",
                prefix: "daily",
                region: "us-east-1",
                credentialsSecret: {
                    secretName: "s3-creds"
                }
            },
            resolvedSecrets: {}
        };

        await expect(orchestrator.write(task, archivePath)).rejects.toThrow(
            "No backup destination provider registered for s3"
        );
        expect(await orchestrator.validate(task)).toBe(false);
    });
});
