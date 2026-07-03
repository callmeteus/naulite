import { describe, expect, it, vi } from "vitest";

const execFileMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
    execFile: execFileMock
}));

vi.mock("node:util", async (importOriginal) => {
    const actual = await importOriginal<typeof import("node:util")>();

    return {
        ...actual,
        promisify: () => execFileMock
    };
});

import { DockerBuilderProvider } from "../../../packages/builders/docker/src/DockerBuilderProvider";

describe("DockerBuilderProvider", () => {
    it("runs docker build and returns image metadata", async () => {
        execFileMock.mockResolvedValueOnce({
            stdout: "build ok",
            stderr: ""
        });

        const provider = new DockerBuilderProvider();
        const result = await provider.buildWithDocker({
            contextPath: "/tmp/context",
            dockerfile: "Dockerfile",
            tags: ["platform/demo-api:latest"]
        });

        expect(result.imageRef).toBe("platform/demo-api:latest");
        expect(result.logs).toContain("build ok");
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
        expect(execFileMock).toHaveBeenCalledWith(
            "docker",
            expect.arrayContaining(["build", "-t", "platform/demo-api:latest"]),
            expect.objectContaining({ maxBuffer: 10 * 1024 * 1024 })
        );
    });

    it("rejects kaniko builds", async () => {
        const provider = new DockerBuilderProvider();

        await expect(provider.buildWithKaniko({
            contextUri: "s3://bucket/context",
            destination: "platform/demo-api:latest"
        })).rejects.toThrow("Kaniko builds are not supported");
    });
});
