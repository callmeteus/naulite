import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    volumeFindAll: vi.fn(),
    backupRunCreate: vi.fn(),
    backupRunUpdate: vi.fn(),
    backupRunCount: vi.fn(),
    nodeFindByPk: vi.fn(),
    nodeFindOne: vi.fn()
}));

vi.mock("../../../packages/control-plane/src/database/models/index", () => ({
    VolumeModel: {
        findAll: mocks.volumeFindAll
    },
    BackupRunModel: {
        create: mocks.backupRunCreate,
        update: mocks.backupRunUpdate,
        count: mocks.backupRunCount
    },
    NodeModel: {
        findByPk: mocks.nodeFindByPk,
        findOne: mocks.nodeFindOne
    }
}));

import { BackupScheduler } from "../../../packages/control-plane/src/modules/backup/BackupScheduler";

describe("BackupScheduler", () => {
    beforeEach(() => {
        mocks.volumeFindAll.mockReset();
        mocks.backupRunCreate.mockReset();
        mocks.backupRunUpdate.mockReset();
        mocks.backupRunCount.mockReset();
        mocks.nodeFindByPk.mockReset();
        mocks.nodeFindOne.mockReset();
    });

    it("skips volumes when cron schedule is not due", async () => {
        mocks.volumeFindAll.mockResolvedValue([
            {
                get: () => ({
                    id: "vol-1",
                    name: "data",
                    manifestName: "demo",
                    scope: "local",
                    nodeId: "node-1",
                    mountPath: "/data",
                    sizeMb: 1024,
                    status: "ready",
                    backup: {
                        schedule: "0 3 * * *",
                        includes: [],
                        excludes: [],
                        destination: { provider: "local", path: "/backups" }
                    },
                    createdAt: "2026-07-02T00:00:00.000Z",
                    updatedAt: "2026-07-02T00:00:00.000Z"
                })
            }
        ]);

        const dispatch = vi.fn();
        const scheduler = new BackupScheduler(60_000, dispatch);

        await scheduler.tick();

        expect(dispatch).not.toHaveBeenCalled();
        expect(mocks.backupRunCreate).not.toHaveBeenCalled();
    });

    it("dispatches due backup tasks to the responsible agent", async () => {
        mocks.volumeFindAll.mockResolvedValue([
            {
                get: () => ({
                    id: "vol-1",
                    name: "data",
                    manifestName: "demo",
                    scope: "local",
                    nodeId: "node-1",
                    mountPath: "/data",
                    sizeMb: 1024,
                    status: "ready",
                    backup: {
                        schedule: "30 14 * * *",
                        includes: ["**/*"],
                        excludes: [],
                        destination: { provider: "local", path: "/backups" }
                    },
                    createdAt: "2026-07-02T00:00:00.000Z",
                    updatedAt: "2026-07-02T00:00:00.000Z"
                })
            }
        ]);
        mocks.backupRunCount.mockResolvedValue(0);
        mocks.backupRunCreate.mockResolvedValue(undefined);
        mocks.backupRunUpdate.mockResolvedValue([1]);
        mocks.nodeFindByPk.mockResolvedValue({
            get: () => ({
                id: "node-1",
                hostname: "agent-1",
                status: "online",
                labels: {},
                capabilities: ["docker"],
                resources: {
                    cpuMillisTotal: 4000,
                    cpuMillisUsed: 0,
                    memoryMbTotal: 8192,
                    memoryMbUsed: 0,
                    diskMbTotal: 102400,
                    diskMbUsed: 0
                },
                agentVersion: "test",
                agentUrl: "http://agent-1:9470",
                lastHeartbeatAt: "2026-07-02T14:30:00.000Z",
                createdAt: "2026-07-02T00:00:00.000Z",
                updatedAt: "2026-07-02T14:30:00.000Z"
            })
        });

        const dispatch = vi.fn(async () => ({ taskId: "task-1", status: "accepted" }));
        const scheduler = new BackupScheduler(60_000, dispatch);

        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-07-02T14:30:00.000Z"));

        await scheduler.tick();

        vi.useRealTimers();

        expect(mocks.backupRunCreate).toHaveBeenCalledTimes(1);
        expect(dispatch).toHaveBeenCalledWith(
            "http://agent-1:9470",
            "/tasks/backup",
            expect.objectContaining({
                volumeName: "data",
                volumeId: "vol-1"
            })
        );
        expect(mocks.backupRunUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ status: "running" }),
            expect.any(Object)
        );
    });

    it("skips tick when the instance is not the leader", async () => {
        mocks.volumeFindAll.mockResolvedValue([
            {
                get: () => ({
                    id: "vol-1",
                    name: "data",
                    manifestName: "demo",
                    scope: "local",
                    nodeId: "node-1",
                    mountPath: "/data",
                    sizeMb: 1024,
                    status: "ready",
                    backup: {
                        schedule: "30 14 * * *",
                        includes: [],
                        excludes: [],
                        destination: { provider: "local", path: "/backups" }
                    },
                    createdAt: "2026-07-02T00:00:00.000Z",
                    updatedAt: "2026-07-02T00:00:00.000Z"
                })
            }
        ]);

        const dispatch = vi.fn();
        const scheduler = new BackupScheduler(60_000, dispatch, { isLeader: () => false });

        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-07-02T14:30:00.000Z"));

        await scheduler.tick();

        vi.useRealTimers();

        expect(dispatch).not.toHaveBeenCalled();
        expect(mocks.volumeFindAll).not.toHaveBeenCalled();
        expect(mocks.backupRunCreate).not.toHaveBeenCalled();
    });

    it("does not dispatch when a run already exists in the current minute", async () => {
        mocks.volumeFindAll.mockResolvedValue([
            {
                get: () => ({
                    id: "vol-1",
                    name: "data",
                    manifestName: "demo",
                    scope: "local",
                    nodeId: "node-1",
                    mountPath: "/data",
                    sizeMb: 1024,
                    status: "ready",
                    backup: {
                        schedule: "30 14 * * *",
                        includes: [],
                        excludes: [],
                        destination: { provider: "local", path: "/backups" }
                    },
                    createdAt: "2026-07-02T00:00:00.000Z",
                    updatedAt: "2026-07-02T00:00:00.000Z"
                })
            }
        ]);
        mocks.backupRunCount.mockResolvedValue(1);

        const dispatch = vi.fn();
        const scheduler = new BackupScheduler(60_000, dispatch);

        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-07-02T14:30:00.000Z"));

        await scheduler.tick();

        vi.useRealTimers();

        expect(dispatch).not.toHaveBeenCalled();
        expect(mocks.backupRunCreate).not.toHaveBeenCalled();
    });
});
