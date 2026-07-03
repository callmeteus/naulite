import type { BackupTask } from "@platform/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    backupRunFindByPk: vi.fn(),
    backupRunUpdate: vi.fn(),
    stageFromAgent: vi.fn()
}));

vi.mock("../../../packages/control-plane/src/database/models/index", () => ({
    BackupRunModel: {
        findByPk: mocks.backupRunFindByPk,
        update: mocks.backupRunUpdate
    }
}));

vi.mock("../../../packages/control-plane/src/services/BackupArchiveStagingService", () => ({
    BackupArchiveStagingService: {
        stageFromAgent: mocks.stageFromAgent
    }
}));

import type { BackupOrchestrator } from "../../../packages/control-plane/src/modules/backup/BackupOrchestrator";
import { BackupCompletionService } from "../../../packages/control-plane/src/services/BackupCompletionService";

describe("BackupCompletionService", () => {
    const task: BackupTask = {
        taskId: "task-1",
        volumeId: "vol-1",
        volumeName: "data",
        nodeId: "node-1",
        destination: {
            provider: "local",
            path: "/var/lib/platform/backups"
        },
        resolvedSecrets: {}
    };

    beforeEach(() => {
        mocks.backupRunFindByPk.mockReset();
        mocks.backupRunUpdate.mockReset();
        mocks.stageFromAgent.mockReset();
        mocks.backupRunFindByPk.mockResolvedValue({
            payload: { volumeName: "data" }
        });
        mocks.backupRunUpdate.mockResolvedValue([1]);
        mocks.stageFromAgent.mockResolvedValue("/tmp/staged/task-1.tar.gz");
    });

    it("completes a backup run when the agent response is valid", async () => {
        const orchestrator = {
            write: vi.fn(async () => ({
                location: "/var/lib/platform/backups/task-1.tar.gz",
                provider: "local",
                taskId: "task-1"
            }))
        } as unknown as BackupOrchestrator;

        const result = await BackupCompletionService.completeRun(orchestrator, task, {
            taskId: "task-1",
            status: "completed",
            archivePath: "/tmp/task-1.tar.gz"
        });

        expect(result).toEqual({
            location: "/var/lib/platform/backups/task-1.tar.gz",
            provider: "local"
        });
        expect(orchestrator.write).toHaveBeenCalledWith(task, "/tmp/task-1.tar.gz");
        expect(mocks.backupRunUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                status: "succeeded",
                payload: expect.objectContaining({
                    location: "/var/lib/platform/backups/task-1.tar.gz",
                    provider: "local",
                    archivePath: "/tmp/task-1.tar.gz"
                })
            }),
            { where: { id: "task-1" } }
        );
    });

    it("throws when the agent response is missing archivePath", async () => {
        const orchestrator = {
            write: vi.fn()
        } as unknown as BackupOrchestrator;

        await expect(
            BackupCompletionService.completeRun(orchestrator, task, {
                taskId: "task-1",
                status: "completed",
                archivePath: "-"
            })
        ).rejects.toThrow("Backup agent response is incomplete or failed");

        expect(orchestrator.write).not.toHaveBeenCalled();
        expect(mocks.backupRunUpdate).not.toHaveBeenCalled();
    });

    it("throws when the agent response reports failure", async () => {
        const orchestrator = {
            write: vi.fn()
        } as unknown as BackupOrchestrator;

        await expect(
            BackupCompletionService.completeRun(orchestrator, task, {
                taskId: "task-1",
                status: "failed",
                archivePath: "/tmp/task-1.tar.gz"
            })
        ).rejects.toThrow("Backup agent response is incomplete or failed");

        expect(orchestrator.write).not.toHaveBeenCalled();
    });

    it("stages archives from the agent before uploading to S3", async () => {
        const orchestrator = {
            write: vi.fn(async () => ({
                location: "s3://platform-backups/daily/data-task-s3.tar.gz",
                provider: "s3",
                taskId: "task-s3"
            }))
        } as unknown as BackupOrchestrator;
        const s3Task: BackupTask = {
            ...task,
            taskId: "task-s3",
            destination: {
                provider: "s3",
                bucket: "platform-backups",
                prefix: "daily",
                region: "us-east-1",
                endpoint: "http://minio:9000",
                credentialsSecret: {
                    secretName: "s3-creds"
                }
            }
        };

        await BackupCompletionService.completeRun(
            orchestrator,
            s3Task,
            {
                taskId: "task-s3",
                status: "completed",
                archivePath: "/var/lib/platform/backups/task-s3.tar.gz"
            },
            { agentUrl: "http://agent-node-a:9470" }
        );

        expect(mocks.stageFromAgent).toHaveBeenCalledWith(
            "http://agent-node-a:9470",
            "/var/lib/platform/backups/task-s3.tar.gz"
        );
        expect(orchestrator.write).toHaveBeenCalledWith(s3Task, "/tmp/staged/task-1.tar.gz");
    });
});
