import { describe, expect, it } from "vitest";

import type { Instance } from "@naulite/shared";
import { ExecInstanceTargetResolver } from "@naulite/shared";

const instances: Instance[] = [
    {
        id: "minimal:web-1",
        serviceId: "minimal:web",
        serviceName: "web",
        nodeId: "agent-worker",
        status: "running",
        image: "nginx:1.27-alpine",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
    },
    {
        id: "minimal:web-2",
        serviceId: "minimal:web",
        serviceName: "web",
        nodeId: "agent-worker",
        status: "running",
        image: "nginx:1.27-alpine",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
    },
    {
        id: "minimal:api-1",
        serviceId: "minimal:api",
        serviceName: "api",
        nodeId: "agent-worker",
        status: "pending",
        image: "demo:latest",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
    }
];

describe("ExecInstanceTargetResolver", () => {
    it("resolves an exact instance id even when multiple service replicas exist", () => {
        const result = ExecInstanceTargetResolver.resolve("minimal:web-2", instances);

        expect(result).toEqual({
            kind: "resolved",
            instanceId: "minimal:web-2"
        });
    });

    it("resolves a service name when exactly one running instance matches", () => {
        const singleRunning: Instance[] = [
            {
                ...instances[0],
                id: "minimal:api-1",
                serviceId: "minimal:api",
                serviceName: "api",
                status: "running"
            }
        ];

        const result = ExecInstanceTargetResolver.resolve("api", singleRunning);

        expect(result).toEqual({
            kind: "resolved",
            instanceId: "minimal:api-1"
        });
    });

    it("returns ambiguous when multiple running instances match a service name", () => {
        const result = ExecInstanceTargetResolver.resolve("web", instances);

        expect(result.kind).toBe("ambiguous");
        if (result.kind === "ambiguous") {
            expect(result.instanceIds).toEqual(["minimal:web-1", "minimal:web-2"]);
        }
    });

    it("returns not found when no running instance matches", () => {
        const result = ExecInstanceTargetResolver.resolve("api", instances);

        expect(result.kind).toBe("not_found");
    });
});
