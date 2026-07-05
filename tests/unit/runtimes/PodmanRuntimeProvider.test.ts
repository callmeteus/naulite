import { describe, expect, it, vi } from "vitest";

const dockerRuntimeMocks = vi.hoisted(() => ({
    pull: vi.fn(async () => undefined),
    create: vi.fn(async () => "container-1"),
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
    getLogs: vi.fn(async () => ["line-1"]),
    exec: vi.fn(async () => ({ exitCode: 0, stdout: "ok", stderr: "" })),
    getHealth: vi.fn(async () => ({
        healthy: true,
        message: "running",
        checkedAt: "2026-01-01T00:00:00.000Z"
    })),
    applyPlan: vi.fn(async () => undefined)
}));

vi.mock("@naulite/runtime-docker", () => ({
    DockerRuntimeProvider: vi.fn(function DockerRuntimeProviderMock() {
        return dockerRuntimeMocks;
    })
}));

import { PodmanRuntimeProvider } from "../../../packages/runtimes/podman/src/PodmanRuntimeProvider";

describe("PodmanRuntimeProvider", () => {
    it("delegates pull to the Docker-compatible Podman socket client", async () => {
        const provider = new PodmanRuntimeProvider({ socketPath: "/tmp/podman.sock" });

        await provider.pull("demo:latest", { registryId: "local" });

        expect(dockerRuntimeMocks.pull).toHaveBeenCalledWith("demo:latest", { registryId: "local" });
    });

    it("delegates applyPlan operations through the docker-compatible client", async () => {
        const provider = new PodmanRuntimeProvider();
        const plan = {
            nodeId: "node-1",
            manifestName: "demo",
            revision: 1,
            operations: [{
                type: "pull" as const,
                image: "demo:latest"
            }]
        };

        await provider.applyPlan(plan);

        expect(dockerRuntimeMocks.applyPlan).toHaveBeenCalledWith(plan);
    });

    it("delegates create, lifecycle, logs, exec, and health calls", async () => {
        const provider = new PodmanRuntimeProvider();

        await provider.create({
            instanceId: "svc-1",
            serviceName: "api",
            image: "demo:latest"
        });
        await provider.start("svc-1");
        await provider.stop("svc-1");
        await provider.remove("svc-1", true);
        await provider.getLogs("svc-1", { tail: 10 });
        await provider.exec("svc-1", ["echo", "ok"]);
        await provider.getHealth("svc-1");

        expect(dockerRuntimeMocks.create).toHaveBeenCalled();
        expect(dockerRuntimeMocks.start).toHaveBeenCalledWith("svc-1");
        expect(dockerRuntimeMocks.stop).toHaveBeenCalledWith("svc-1");
        expect(dockerRuntimeMocks.remove).toHaveBeenCalledWith("svc-1", true);
        expect(dockerRuntimeMocks.getLogs).toHaveBeenCalledWith("svc-1", { tail: 10 });
        expect(dockerRuntimeMocks.exec).toHaveBeenCalledWith("svc-1", ["echo", "ok"]);
        expect(dockerRuntimeMocks.getHealth).toHaveBeenCalledWith("svc-1");
    });
});
