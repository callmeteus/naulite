import type { ResolvedSecret } from "../types/Common";
import type { ExecutionPlan } from "../types/ExecutionPlan";
import type { InstanceHealth, ResourceRequirements } from "../types/index";

/**
 * Options for pulling a container image on a node.
 */
export interface PullImageOptions {
    registryId?: string;
    credentials?: ResolvedSecret;
}

/**
 * Specification for creating a container instance.
 */
export interface CreateInstanceSpec {
    instanceId: string;
    serviceName: string;
    image: string;
    command?: string[];
    environment?: Record<string, string>;
    volumes?: Array<{
        volumeName: string;
        mountPath: string;
        readOnly?: boolean;
    }>;
    networks?: string[];
    ports?: Array<{
        containerPort: number;
        hostPort?: number;
        protocol?: "tcp" | "udp";
    }>;
    resources?: ResourceRequirements;
    secrets?: ResolvedSecret[];
}

/**
 * Options for streaming container logs.
 */
export interface LogStreamOptions {
    follow?: boolean;
    tail?: number;
    since?: string;
}

/**
 * Result of an exec invocation inside a container.
 */
export interface ExecResult {
    exitCode: number;
    stdout: string;
    stderr: string;
}

/**
 * Runtime provider contract implemented by docker, podman, and containerd packages.
 */
export interface RuntimeProvider {
    /**
     * Pulls a container image on the target node.
     * 
     * @param image Image reference to pull
     * @param options Optional registry and credential options
     * @returns Nothing.
     */
    pull(image: string, options?: PullImageOptions): Promise<void>;

    /**
     * Creates a container instance without starting it.
     * 
     * @param spec Instance creation specification
     * @returns Created container identifier
     */
    create(spec: CreateInstanceSpec): Promise<string>;

    /**
     * Starts a previously created instance.
     * 
     * @param instanceId Instance identifier
     * @returns Nothing.
     */
    start(instanceId: string): Promise<void>;

    /**
     * Stops a running instance.
     * 
     * @param instanceId Instance identifier
     * @returns Nothing.
     */
    stop(instanceId: string): Promise<void>;

    /**
     * Removes an instance from the node.
     * 
     * @param instanceId Instance identifier
     * @param force Whether to force removal
     * @returns Nothing.
     */
    remove(instanceId: string, force?: boolean): Promise<void>;

    /**
     * Streams or fetches logs for an instance.
     * 
     * @param instanceId Instance identifier
     * @param options Log stream options
     * @returns Log lines
     */
    getLogs(instanceId: string, options?: LogStreamOptions): Promise<string[]>;

    /**
     * Executes a command inside a running instance.
     * 
     * @param instanceId Instance identifier
     * @param command Command and arguments to run
     * @returns Exec result with exit code and output
     */
    exec(instanceId: string, command: string[]): Promise<ExecResult>;

    /**
     * Reads the current health state for an instance.
     * 
     * @param instanceId Instance identifier
     * @returns Instance health snapshot
     */
    getHealth(instanceId: string): Promise<InstanceHealth>;

    /**
     * Applies an execution plan produced by the control plane scheduler.
     * 
     * @param plan Execution plan for the local node
     * @returns Nothing.
     */
    applyPlan(plan: ExecutionPlan): Promise<void>;
}
