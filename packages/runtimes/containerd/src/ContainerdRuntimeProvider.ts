import type {
    CreateInstanceSpec,
    ExecResult,
    LogStreamOptions,
    PullImageOptions,
    RuntimeProvider
} from "@naulite/shared";
import type { ExecutionPlan, InstanceHealth } from "@naulite/shared";

import { RuntimeNotConfiguredError } from "./RuntimeNotConfiguredError";

/**
 * Runtime identifier reported by this provider stub.
 */
const RUNTIME_ID = "containerd";

/**
 * containerd runtime provider stub that reports the runtime as not configured.
 */
export class ContainerdRuntimeProvider implements RuntimeProvider {
    /**
     * Pulls a container image through containerd.
     * 
     * @param image Image reference to pull
     * @param options Optional registry and credential options
     * @returns Nothing.
     * @throws {RuntimeNotConfiguredError} {@link RuntimeNotConfiguredError}
     */
    async pull(image: string, options?: PullImageOptions): Promise<void> {
        console.debug("[runtime-containerd] pull requested image=%s registryId=%s", image, options?.registryId ?? "-");
        throw new RuntimeNotConfiguredError(RUNTIME_ID);
    }

    /**
     * Creates a container without starting it.
     * 
     * @param spec Instance creation specification
     * @returns Created container identifier
     * @throws {RuntimeNotConfiguredError} {@link RuntimeNotConfiguredError}
     */
    async create(spec: CreateInstanceSpec): Promise<string> {
        console.debug("[runtime-containerd] create requested instanceId=%s", spec.instanceId);
        throw new RuntimeNotConfiguredError(RUNTIME_ID);
    }

    /**
     * Starts a previously created instance.
     * 
     * @param instanceId Instance identifier
     * @returns Nothing.
     * @throws {RuntimeNotConfiguredError} {@link RuntimeNotConfiguredError}
     */
    async start(instanceId: string): Promise<void> {
        console.debug("[runtime-containerd] start requested instanceId=%s", instanceId);
        throw new RuntimeNotConfiguredError(RUNTIME_ID);
    }

    /**
     * Stops a running instance.
     * 
     * @param instanceId Instance identifier
     * @returns Nothing.
     * @throws {RuntimeNotConfiguredError} {@link RuntimeNotConfiguredError}
     */
    async stop(instanceId: string): Promise<void> {
        console.debug("[runtime-containerd] stop requested instanceId=%s", instanceId);
        throw new RuntimeNotConfiguredError(RUNTIME_ID);
    }

    /**
     * Removes an instance from the node.
     * 
     * @param instanceId Instance identifier
     * @param force Whether to force removal
     * @returns Nothing.
     * @throws {RuntimeNotConfiguredError} {@link RuntimeNotConfiguredError}
     */
    async remove(instanceId: string, force?: boolean): Promise<void> {
        console.debug("[runtime-containerd] remove requested instanceId=%s force=%s", instanceId, force ?? false);
        throw new RuntimeNotConfiguredError(RUNTIME_ID);
    }

    /**
     * Streams or fetches logs for an instance.
     * 
     * @param instanceId Instance identifier
     * @param options Log stream options
     * @returns Log lines
     * @throws {RuntimeNotConfiguredError} {@link RuntimeNotConfiguredError}
     */
    async getLogs(instanceId: string, options?: LogStreamOptions): Promise<string[]> {
        console.debug("[runtime-containerd] getLogs requested instanceId=%s tail=%s", instanceId, options?.tail ?? "-");
        throw new RuntimeNotConfiguredError(RUNTIME_ID);
    }

    /**
     * Executes a command inside a running instance.
     * 
     * @param instanceId Instance identifier
     * @param command Command and arguments to run
     * @returns Exec result with exit code and output
     * @throws {RuntimeNotConfiguredError} {@link RuntimeNotConfiguredError}
     */
    async exec(instanceId: string, command: string[]): Promise<ExecResult> {
        console.debug("[runtime-containerd] exec requested instanceId=%s command=%o", instanceId, command);
        throw new RuntimeNotConfiguredError(RUNTIME_ID);
    }

    /**
     * Reads the current health state for an instance.
     * 
     * @param instanceId Instance identifier
     * @returns Instance health snapshot
     * @throws {RuntimeNotConfiguredError} {@link RuntimeNotConfiguredError}
     */
    async getHealth(instanceId: string): Promise<InstanceHealth> {
        console.debug("[runtime-containerd] getHealth requested instanceId=%s", instanceId);
        throw new RuntimeNotConfiguredError(RUNTIME_ID);
    }

    /**
     * Applies an execution plan through containerd.
     * 
     * @param plan Execution plan for the local node
     * @returns Nothing.
     * @throws {RuntimeNotConfiguredError} {@link RuntimeNotConfiguredError}
     */
    async applyPlan(plan: ExecutionPlan): Promise<void> {
        console.debug(
            "[runtime-containerd] applyPlan requested nodeId=%s operations=%d",
            plan.nodeId,
            plan.operations.length
        );

        throw new RuntimeNotConfiguredError(RUNTIME_ID);
    }
}

/**
 * Creates a containerd runtime provider stub.
 * 
 * @returns containerd runtime provider instance
 */
export function createContainerdRuntimeProvider(): ContainerdRuntimeProvider {
    return new ContainerdRuntimeProvider();
}
