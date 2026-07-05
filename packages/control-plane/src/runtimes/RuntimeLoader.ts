import { createContainerdRuntimeProvider } from "@naulite/runtime-containerd";
import { createDockerRuntimeProvider } from "@naulite/runtime-docker";
import { createPodmanRuntimeProvider } from "@naulite/runtime-podman";

import { RuntimeRegistry } from "./RuntimeRegistry";

/**
 * Loads built-in runtime providers into a registry.
 */
export namespace RuntimeLoader {
    /**
     * Registers Docker, Podman, and containerd runtime providers.
     *
     * @param registry Runtime registry to populate
     * @returns Loaded runtime registry
     */
    export function load(registry: RuntimeRegistry = new RuntimeRegistry()): RuntimeRegistry {
        registry.register("docker", createDockerRuntimeProvider());
        registry.register("podman", createPodmanRuntimeProvider());
        registry.register("containerd", createContainerdRuntimeProvider());
        console.debug("[runtimes] loaded ids=%o", registry.listIds());
        return registry;
    }
}
