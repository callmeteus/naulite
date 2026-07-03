import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    mockServiceFindAll: vi.fn(),
    mockInstanceFindAll: vi.fn(),
    mockLogRotationRunCreate: vi.fn(),
    mockLogRotationRunUpdate: vi.fn(),
    mockLogRotationRunCount: vi.fn(),
    mockNodeFindByPk: vi.fn()
}));

vi.mock("../../../packages/control-plane/src/database/models/index", () => ({
    ServiceModel: {
        findAll: mocks.mockServiceFindAll
    },
    InstanceModel: {
        findAll: mocks.mockInstanceFindAll
    },
    LogRotationRunModel: {
        create: mocks.mockLogRotationRunCreate,
        update: mocks.mockLogRotationRunUpdate,
        count: mocks.mockLogRotationRunCount
    },
    NodeModel: {
        findByPk: mocks.mockNodeFindByPk
    }
}));

import { LogRotationScheduler } from "../../../packages/control-plane/src/modules/log-rotation/LogRotationScheduler";

describe("LogRotationScheduler", () => {
    beforeEach(() => {
        mocks.mockServiceFindAll.mockReset();
        mocks.mockInstanceFindAll.mockReset();
        mocks.mockLogRotationRunCreate.mockReset();
        mocks.mockLogRotationRunUpdate.mockReset();
        mocks.mockLogRotationRunCount.mockReset();
        mocks.mockNodeFindByPk.mockReset();
    });

    it("skips services when cron schedule is not due", async () => {
        mocks.mockServiceFindAll.mockResolvedValue([
            {
                get: () => ({
                    id: "svc-1",
                    name: "api",
                    manifestName: "demo",
                    image: "nginx:latest",
                    status: "running",
                    logRotation: {
                        schedule: "0 0 * * *",
                        paths: ["/var/log/app.log"],
                        includes: ["*.log"],
                        excludes: [],
                        compress: false
                    },
                    createdAt: "2026-07-02T00:00:00.000Z",
                    updatedAt: "2026-07-02T00:00:00.000Z"
                })
            }
        ]);
        mocks.mockInstanceFindAll.mockResolvedValue([]);

        const dispatch = vi.fn();
        const scheduler = new LogRotationScheduler(60_000, dispatch);

        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-07-02T14:30:00.000Z"));

        await scheduler.tick();

        vi.useRealTimers();

        expect(dispatch).not.toHaveBeenCalled();
    });

    it("dispatches due log rotation tasks to the instance agent", async () => {
        mocks.mockServiceFindAll.mockResolvedValue([
            {
                get: () => ({
                    id: "svc-1",
                    name: "api",
                    manifestName: "demo",
                    image: "nginx:latest",
                    status: "running",
                    logRotation: {
                        schedule: "30 14 * * *",
                        paths: ["/var/log/app.log"],
                        includes: ["*.log"],
                        excludes: [],
                        compress: false
                    },
                    createdAt: "2026-07-02T00:00:00.000Z",
                    updatedAt: "2026-07-02T00:00:00.000Z"
                })
            }
        ]);
        mocks.mockInstanceFindAll.mockResolvedValue([
            {
                get: () => ({
                    id: "demo:api-1",
                    serviceId: "svc-1",
                    serviceName: "api",
                    nodeId: "node-1",
                    status: "running",
                    createdAt: "2026-07-02T00:00:00.000Z",
                    updatedAt: "2026-07-02T14:30:00.000Z"
                })
            }
        ]);
        mocks.mockLogRotationRunCount.mockResolvedValue(0);
        mocks.mockLogRotationRunCreate.mockResolvedValue(undefined);
        mocks.mockLogRotationRunUpdate.mockResolvedValue([1]);
        mocks.mockNodeFindByPk.mockResolvedValue({
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

        const dispatch = vi.fn(async () => ({ taskId: "rotate-1", status: "accepted" }));
        const scheduler = new LogRotationScheduler(60_000, dispatch);

        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-07-02T14:30:00.000Z"));

        await scheduler.tick();

        vi.useRealTimers();

        expect(mocks.mockLogRotationRunCreate).toHaveBeenCalledTimes(1);
        expect(dispatch).toHaveBeenCalledWith(
            "http://agent-1:9470",
            "/tasks/log-rotation",
            expect.objectContaining({
                serviceName: "api",
                instanceId: "demo:api-1"
            })
        );
    });
});
