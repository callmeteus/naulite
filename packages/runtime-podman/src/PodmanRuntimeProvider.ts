import type {
    CreateInstanceSpec,
    ExecResult,
    LogStreamOptions,
    PullImageOptions,
    RuntimeProvider
} from "@platform/shared";
import type { ExecutionPlan, InstanceHealth } from "@platform/shared";

import { RuntimeNotConfiguredError } from "./RuntimeNotConfiguredError.js";

const RUNTIME_ID = "podman";

/**
 * Podman runtime provider stub that reports the runtime as not configured.
 */
export class PodmanRuntimeProvider implements RuntimeProvider {
    /**
     * Pulls a container image through Podman.
     * 
     * @param image Image reference to pull
     * @param options Optional registry and credential options
     * @returns Nothing.
     */
    async pull(image: string, options?: PullImageOptions): Promise<void> {
        console.debug("[runtime-podman] pull requested image=%s registryId=%s", image, options?.registryId ?? "-");
        throw new RuntimeNotConfiguredError(RUNTIME_ID);
    }

    /**
     * Creates a container without starting it.
     * 
     * @param spec Instance creation specification
     * @returns Created container identifier
     */
    async create(spec: CreateInstanceSpec): Promise<string> {
        console.debug("[runtime-podman] create requested instanceId=%s", spec.instanceId);
        throw new RuntimeNotConfiguredError(RUNTIME_ID);
    }

    /**
     * Starts a previously created instance.
     * 
     * @param instanceId Instance identifier
     * @returns Nothing.
     */
    async start(instanceId: string): Promise<void> {
        console.debug("[runtime-podman] start requested instanceId=%s", instanceId);
        throw new RuntimeNotConfiguredError(RUNTIME_ID);
    }

    /**
     * Stops a running instance.
     * 
     * @param instanceId Instance identifier
     * @returns Nothing.
     */
    async stop(instanceId: string): Promise<void> {
        console.debug("[runtime-podman] stop requested instanceId=%s", instanceId);
        throw new RuntimeNotConfiguredError(RUNTIME_ID);
    }

    /**
     * Removes an instance from the node.
     * 
     * @param instanceId Instance identifier
     * @param force Whether to force removal
     * @returns Nothing.
     */
    async remove(instanceId: string, force?: boolean): Promise<void> {
        console.debug("[runtime-podman] remove requested instanceId=%s force=%s", instanceId, force ?? false);
        throw new RuntimeNotConfiguredError(RUNTIME_ID);
    }

    /**
     * Streams or fetches logs for an instance.
     * 
     * @param instanceId Instance identifier
     * @param options Log stream options
     * @returns Log lines
     */
    async getLogs(instanceId: string, options?: LogStreamOptions): Promise<string[]> {
        console.debug("[runtime-podman] getLogs requested instanceId=%s tail=%s", instanceId, options?.tail ?? "-");
        throw new RuntimeNotConfiguredError(RUNTIME_ID);
    }

    /**
     * Executes a command inside a running instance.
     * 
     * @param instanceId Instance identifier
     * @param command Command and arguments to run
     * @returns Exec result with exit code and output
     */
    async exec(instanceId: string, command: string[]): Promise<ExecResult> {
        console.debug("[runtime-podman] exec requested instanceId=%s command=%o", instanceId, command);
        throw new RuntimeNotConfiguredError(RUNTIME_ID);
    }

    /**
     * Reads the current health state for an instance.
     * 
     * @param instanceId Instance identifier
     * @returns Instance health snapshot
     */
    async getHealth(instanceId: string): Promise<InstanceHealth> {
        console.debug("[runtime-podman] getHealth requested instanceId=%s", instanceId);
        throw new RuntimeNotConfiguredError(RUNTIME_ID);
    }

    /**
     * Applies an execution plan through Podman.
     * 
     * @param plan Execution plan for the local node
     * @returns Nothing.
     */
    async applyPlan(plan: ExecutionPlan): Promise<void> {
        console.debug("[runtime-podman] applyPlan requested nodeId=%s operations=%d", plan.nodeId, plan.operations.length);
        throw new RuntimeNotConfiguredError(RUNTIME_ID);
    }
}

/**
 * Creates a Podman runtime provider stub.
 * 
 * @returns Podman runtime provider instance
 */
export function createPodmanRuntimeProvider(): PodmanRuntimeProvider {
    return new PodmanRuntimeProvider();
}
