import { Readable } from "node:stream";

import type { BackupTask, Node } from "@platform/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    postBinary: vi.fn(),
    dispatchRestoreTask: vi.fn()
}));

vi.mock("../../../packages/control-plane/src/services/AgentProxyService", () => ({
    AgentProxyService: {
        postBinary: mocks.postBinary
    },
    AgentProxyError: class AgentProxyError extends Error {}
}));

vi.mock("../../../packages/control-plane/src/services/BackupDispatchService", () => ({
    BackupDispatchService: {
        dispatchRestoreTask: mocks.dispatchRestoreTask
    }
}));

import { BackupRestoreService } from "../../../packages/control-plane/src/services/BackupRestoreService";
import type { BackupOrchestrator } from "../../../packages/control-plane/src/modules/backup/BackupOrchestrator";

describe("BackupRestoreService", () => {
    const node: Node = {
        id: "node-1",
        hostname: "agent-1",
        status: "ready",
        labels: {},
        capabilities: [],
        resources: {},
        agentVersion: "test",
        agentUrl: "http://agent-node-a:9470",
        lastHeartbeatAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    beforeEach(() => {
        mocks.postBinary.mockReset();
        mocks.dispatchRestoreTask.mockReset();
        mocks.postBinary.mockResolvedValue({ storedPath: "/var/lib/platform/backups/run-1.tar.gz" });
        mocks.dispatchRestoreTask.mockResolvedValue({
            backupId: "run-1",
            volumeName: "app-data",
            status: "completed"
        });
    });

    it("restores an S3 backup by streaming it to the agent before dispatching restore", async () => {
        const archiveBytes = Buffer.from("s3-backup-archive");
        const orchestrator = {
            read: vi.fn(async () => ({
                stream: Readable.from([archiveBytes]),
                sizeBytes: archiveBytes.length
            }))
        } as unknown as BackupOrchestrator;

        const result = await BackupRestoreService.restore({
            backupId: "run-1",
            run: {
                id: "run-1",
                volumeName: "app-data",
                status: "succeeded",
                payload: {
                    provider: "s3",
                    location: "s3://platform-backups/e2e/app-data-run-1.tar.gz",
                    destination: {
                        provider: "s3",
                        bucket: "platform-backups",
                        prefix: "e2e",
                        region: "us-east-1",
                        endpoint: "http://minio:9000",
                        credentialsSecret: { secretName: "s3-creds" }
                    }
                }
            },
            node,
            orchestrator
        });

        expect(orchestrator.read).toHaveBeenCalledWith(
            expect.objectContaining({
                taskId: "run-1",
                volumeName: "app-data",
                destination: expect.objectContaining({ provider: "s3" })
            }),
            "s3://platform-backups/e2e/app-data-run-1.tar.gz"
        );
        expect(mocks.postBinary).toHaveBeenCalledWith(
            node.agentUrl,
            "/backups/receive?backupId=run-1",
            archiveBytes,
            "application/gzip"
        );
        expect(mocks.dispatchRestoreTask).toHaveBeenCalledWith(node, {
            backupId: "run-1",
            volumeName: "app-data",
            archivePath: "/var/lib/platform/backups/run-1.tar.gz",
            mountPath: undefined
        });
        expect(result).toEqual({
            backupId: "run-1",
            volumeName: "app-data",
            status: "completed"
        });
    });

    it("dispatches restore directly for local backups using archivePath", async () => {
        const orchestrator = {
            read: vi.fn()
        } as unknown as BackupOrchestrator;

        await BackupRestoreService.restore({
            backupId: "run-2",
            run: {
                id: "run-2",
                volumeName: "app-data",
                status: "succeeded",
                payload: {
                    provider: "local",
                    archivePath: "/var/lib/platform/backups/run-2.tar.gz",
                    location: "/var/lib/platform/backups/data-run-2.tar.gz"
                }
            },
            node,
            orchestrator
        });

        expect(orchestrator.read).not.toHaveBeenCalled();
        expect(mocks.postBinary).not.toHaveBeenCalled();
        expect(mocks.dispatchRestoreTask).toHaveBeenCalledWith(node, {
            backupId: "run-2",
            volumeName: "app-data",
            archivePath: "/var/lib/platform/backups/run-2.tar.gz",
            mountPath: undefined
        });
    });

    it("throws when an S3 backup has no location", async () => {
        const orchestrator = {
            read: vi.fn()
        } as unknown as BackupOrchestrator;

        await expect(
            BackupRestoreService.restore({
                backupId: "run-3",
                run: {
                    id: "run-3",
                    volumeName: "app-data",
                    status: "succeeded",
                    payload: {
                        provider: "s3",
                        destination: {
                            provider: "s3",
                            bucket: "platform-backups",
                            prefix: "e2e",
                            region: "us-east-1",
                            credentialsSecret: { secretName: "s3-creds" }
                        }
                    }
                },
                node,
                orchestrator
            })
        ).rejects.toThrow("não possui localização S3 registrada");
    });

    it("extracts backup tasks from persisted payloads", () => {
        const task: BackupTask = BackupRestoreService.extractBackupTask(
            {
                taskId: "run-4",
                volumeId: "backup-s3-volume:app-data",
                volumeName: "app-data",
                nodeId: "node-1",
                destination: {
                    provider: "s3",
                    bucket: "platform-backups",
                    prefix: "e2e",
                    region: "us-east-1",
                    credentialsSecret: { secretName: "s3-creds" }
                },
                resolvedSecrets: { "s3-creds": "configured" }
            },
            "run-4",
            "app-data"
        );

        expect(task.destination).toEqual({
            provider: "s3",
            bucket: "platform-backups",
            prefix: "e2e",
            region: "us-east-1",
            credentialsSecret: { secretName: "s3-creds" }
        });
        expect(task.resolvedSecrets).toEqual({ "s3-creds": "configured" });
    });
});
