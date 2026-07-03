import type Dockerode from "dockerode";

import { DockerRuntimeProvider, type DockerRuntimeProviderOptions } from "@platform/runtime-docker";
import type {
    CreateInstanceSpec,
    ExecResult,
    LogStreamOptions,
    PullImageOptions,
    RuntimeProvider
} from "@platform/shared";
import type { ExecutionPlan, InstanceHealth } from "@platform/shared";

/**
 * Options for constructing a Podman runtime provider.
 */
export interface PodmanRuntimeProviderOptions {
    socketPath?: string;
    client?: Dockerode;
}

/**
 * Podman runtime provider backed by the Docker-compatible Podman socket API.
 */
export class PodmanRuntimeProvider implements RuntimeProvider {
    private readonly delegate: DockerRuntimeProvider;

    /**
     * Creates a Podman runtime provider.
     *
     * @param options Podman socket path or injected dockerode client
     */
    constructor(options: PodmanRuntimeProviderOptions = {}) {
        const dockerOptions: DockerRuntimeProviderOptions = {
            client: options.client,
            socketPath: options.socketPath ?? process.env.PODMAN_SOCKET ?? "/run/podman/podman.sock"
        };
        this.delegate = new DockerRuntimeProvider(dockerOptions);
    }

    /**
     * Pulls a container image through Podman.
     * 
     * @param image Image reference to pull
     * @param options Optional registry and credential options
     * @returns Nothing.
     */
    async pull(image: string, options?: PullImageOptions): Promise<void> {
        console.debug("[runtime-podman] pull image=%s registryId=%s", image, options?.registryId ?? "-");
        await this.delegate.pull(image, options);
    }

    /**
     * Creates a container without starting it.
     * 
     * @param spec Instance creation specification
     * @returns Created container identifier
     */
    async create(spec: CreateInstanceSpec): Promise<string> {
        console.debug("[runtime-podman] create instanceId=%s image=%s", spec.instanceId, spec.image);
        return this.delegate.create(spec);
    }

    /**
     * Starts a previously created instance.
     * 
     * @param instanceId Instance identifier
     * @returns Nothing.
     */
    async start(instanceId: string): Promise<void> {
        console.debug("[runtime-podman] start instanceId=%s", instanceId);
        await this.delegate.start(instanceId);
    }

    /**
     * Stops a running instance.
     * 
     * @param instanceId Instance identifier
     * @returns Nothing.
     */
    async stop(instanceId: string): Promise<void> {
        console.debug("[runtime-podman] stop instanceId=%s", instanceId);
        await this.delegate.stop(instanceId);
    }

    /**
     * Removes an instance from the node.
     * 
     * @param instanceId Instance identifier
     * @param force Whether to force removal
     * @returns Nothing.
     */
    async remove(instanceId: string, force?: boolean): Promise<void> {
        console.debug("[runtime-podman] remove instanceId=%s force=%s", instanceId, force ?? false);
        await this.delegate.remove(instanceId, force);
    }

    /**
     * Streams or fetches logs for an instance.
     * 
     * @param instanceId Instance identifier
     * @param options Log stream options
     * @returns Log lines
     */
    async getLogs(instanceId: string, options?: LogStreamOptions): Promise<string[]> {
        console.debug("[runtime-podman] getLogs instanceId=%s tail=%s", instanceId, options?.tail ?? "-");
        return this.delegate.getLogs(instanceId, options);
    }

    /**
     * Executes a command inside a running instance.
     * 
     * @param instanceId Instance identifier
     * @param command Command and arguments to run
     * @returns Exec result with exit code and output
     */
    async exec(instanceId: string, command: string[]): Promise<ExecResult> {
        console.debug("[runtime-podman] exec instanceId=%s command=%o", instanceId, command);
        return this.delegate.exec(instanceId, command);
    }

    /**
     * Reads the current health state for an instance.
     * 
     * @param instanceId Instance identifier
     * @returns Instance health snapshot
     */
    async getHealth(instanceId: string): Promise<InstanceHealth> {
        console.debug("[runtime-podman] getHealth instanceId=%s", instanceId);
        return this.delegate.getHealth(instanceId);
    }

    /**
     * Applies an execution plan through Podman.
     * 
     * @param plan Execution plan for the local node
     * @returns Nothing.
     */
    async applyPlan(plan: ExecutionPlan): Promise<void> {
        console.debug("[runtime-podman] applyPlan nodeId=%s operations=%d", plan.nodeId, plan.operations.length);
        await this.delegate.applyPlan(plan);
    }
}

/**
 * Creates a Podman runtime provider.
 * 
 * @param options Podman runtime provider options
 * @returns Podman runtime provider instance
 */
export function createPodmanRuntimeProvider(options?: PodmanRuntimeProviderOptions): PodmanRuntimeProvider {
    return new PodmanRuntimeProvider(options);
}
