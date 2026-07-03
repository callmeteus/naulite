import { describe, expect, it } from "vitest";

import { RuntimeLoader } from "../../../packages/control-plane/src/runtimes/RuntimeLoader";
import { RuntimeNotConfiguredError } from "../../../packages/runtimes/containerd/src/RuntimeNotConfiguredError";

describe("RuntimeLoader", () => {
    it("registers docker, podman, and containerd runtime providers", () => {
        const registry = RuntimeLoader.load();

        expect(registry.listIds()).toEqual(["containerd", "docker", "podman"]);
        expect(registry.get("docker")).toBeDefined();
        expect(registry.get("podman")).toBeDefined();
        expect(registry.get("containerd")).toBeDefined();
    });

    it("keeps containerd as an explicit not-configured stub", async () => {
        const registry = RuntimeLoader.load();
        const containerd = registry.require("containerd");

        await expect(containerd.pull("demo:latest")).rejects.toBeInstanceOf(RuntimeNotConfiguredError);
    });
});
