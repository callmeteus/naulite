import type { ManifestService, Node } from "@naulite/shared";
import { describe, expect, it } from "vitest";

import { BuildService } from "../../../packages/control-plane/src/services/BuildService";

describe("BuildService", () => {
    const builderNode: Node = {
        id: "builder-1",
        hostname: "builder",
        status: "online",
        labels: {},
        capabilities: ["builder"],
        resources: {
            cpuMillisTotal: 1000,
            cpuMillisUsed: 100,
            memoryMbTotal: 1024,
            memoryMbUsed: 128,
            diskMbTotal: 10240,
            diskMbUsed: 512
        },
        agentVersion: "0.1.0",
        agentUrl: "http://builder:9470",
        lastHeartbeatAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    it("selects only builder-capable nodes", () => {
        const nodes: Node[] = [
            {
                ...builderNode,
                id: "worker-1",
                capabilities: [],
                agentUrl: "http://worker:9470"
            },
            builderNode
        ];

        expect(BuildService.resolveBuilderNode(nodes)?.id).toBe("builder-1");
    });

    it("returns null build ref for static image services", () => {
        const service: ManifestService = {
            image: "nginx:alpine",
            capabilities: []
        };

        expect(BuildService.buildRefForService(service)).toBeNull();
    });

    it("resolves build config from a string build block", () => {
        const service: ManifestService = {
            build: "./api",
            capabilities: []
        };

        const config = BuildService.resolveServiceBuildConfig("demo", "api", service);

        expect(config?.buildRef).toBe("build://./api");
        expect(config?.contextPath).toBe("./api");
        expect(config?.tags).toEqual(["naulite/demo-api:latest"]);
        expect(config?.crRef).toBe("container-registry://demo-api:latest");
    });
});
