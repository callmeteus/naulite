import Dockerode from "dockerode";

import type {
    CreateInstanceSpec,
    ExecResult,
    LogStreamOptions,
    PullImageOptions,
    RuntimeProvider
} from "@platform/shared";
import type { ExecutionPlan, InstanceHealth } from "@platform/shared";

/**
 * Options for constructing a Docker runtime provider.
 */
export interface DockerRuntimeProviderOptions {
    socketPath?: string;
    client?: Dockerode;
}

/**
 * Docker engine runtime provider backed by dockerode.
 */
export class DockerRuntimeProvider implements RuntimeProvider {
    private readonly client: Dockerode;

    /**
     * Creates a Docker runtime provider.
     * 
     * @param options Docker socket path or injected dockerode client
     */
    constructor(options: DockerRuntimeProviderOptions = {}) {
        if (options.client) {
            this.client = options.client;
            return;
        }

        const Docker = Dockerode;
        this.client = new Docker({ socketPath: options.socketPath ?? "/var/run/docker.sock" });
    }

    /**
     * Pulls a container image through the Docker engine.
     * 
     * @param image Image reference to pull
     * @param options Optional registry and credential options
     * @returns Nothing.
     */
    async pull(image: string, options?: PullImageOptions): Promise<void> {
        console.debug("[runtime-docker] pull image=%s registryId=%s", image, options?.registryId ?? "-");
        await this.client.pull(image);
    }

    /**
     * Creates a container without starting it.
     * 
     * @param spec Instance creation specification
     * @returns Created container identifier
     */
    async create(spec: CreateInstanceSpec): Promise<string> {
        console.debug("[runtime-docker] create instanceId=%s image=%s", spec.instanceId, spec.image);
        const container = await this.client.createContainer({
            name: spec.instanceId,
            Image: spec.image,
            Cmd: spec.command,
            Env: Object.entries(spec.environment ?? {}).map(([key, value]) => `${key}=${value}`),
            HostConfig: {
                PortBindings: this.buildPortBindings(spec.ports),
                Binds: (spec.volumes ?? []).map((volume) => {
                    const suffix = volume.readOnly ? ":ro" : "";
                    return `${volume.volumeName}:${volume.mountPath}${suffix}`;
                })
            }
        });
        return container.id;
    }

    /**
     * Starts a previously created container.
     * 
     * @param instanceId Instance identifier
     * @returns Nothing.
     */
    async start(instanceId: string): Promise<void> {
        console.debug("[runtime-docker] start instanceId=%s", instanceId);
        const container = this.client.getContainer(instanceId);
        await container.start();
    }

    /**
     * Stops a running container.
     * 
     * @param instanceId Instance identifier
     * @returns Nothing.
     */
    async stop(instanceId: string): Promise<void> {
        console.debug("[runtime-docker] stop instanceId=%s", instanceId);
        const container = this.client.getContainer(instanceId);
        await container.stop();
    }

    /**
     * Removes a container from the node.
     * 
     * @param instanceId Instance identifier
     * @param force Whether to force removal
     * @returns Nothing.
     */
    async remove(instanceId: string, force = false): Promise<void> {
        console.debug("[runtime-docker] remove instanceId=%s force=%s", instanceId, force);
        const container = this.client.getContainer(instanceId);
        await container.remove({ force });
    }

    /**
     * Fetches container logs.
     * 
     * @param instanceId Instance identifier
     * @param options Log stream options
     * @returns Log lines
     */
    async getLogs(instanceId: string, options?: LogStreamOptions): Promise<string[]> {
        console.debug("[runtime-docker] getLogs instanceId=%s tail=%s", instanceId, options?.tail ?? "-");
        const container = this.client.getContainer(instanceId);
        if (options?.follow) {
            const stream = await container.logs({
                stdout: true,
                stderr: true,
                tail: options.tail ?? 100,
                follow: true,
                since: options.since ? Math.floor(Date.parse(options.since) / 1000) : undefined
            });
            const output = await this.collectStream(stream);
            return output.split(/\r?\n/).filter((line) => line.length > 0);
        }

        const buffer = await container.logs({
            stdout: true,
            stderr: true,
            tail: options?.tail ?? 100,
            follow: false,
            since: options?.since ? Math.floor(Date.parse(options.since) / 1000) : undefined
        });
        return buffer.toString("utf8").split(/\r?\n/).filter((line) => line.length > 0);
    }

    /**
     * Executes a command inside a running container.
     * 
     * @param instanceId Instance identifier
     * @param command Command and arguments to run
     * @returns Exec result with exit code and output
     */
    async exec(instanceId: string, command: string[]): Promise<ExecResult> {
        console.debug("[runtime-docker] exec instanceId=%s command=%o", instanceId, command);
        const container = this.client.getContainer(instanceId);
        const exec = await container.exec({
            Cmd: command,
            AttachStdout: true,
            AttachStderr: true
        });
        const stream = await exec.start({ hijack: true, stdin: false });
        const output = await this.collectStream(stream);
        const inspect = await exec.inspect();
        return {
            exitCode: inspect.ExitCode ?? 1,
            stdout: output,
            stderr: ""
        };
    }

    /**
     * Reads the current health state for a container.
     * 
     * @param instanceId Instance identifier
     * @returns Instance health snapshot
     */
    async getHealth(instanceId: string): Promise<InstanceHealth> {
        console.debug("[runtime-docker] getHealth instanceId=%s", instanceId);
        const container = this.client.getContainer(instanceId);
        const inspect = await container.inspect();
        const healthStatus = inspect.State.Health?.Status;
        const healthy = inspect.State.Running === true && (healthStatus === undefined || healthStatus === "healthy");
        return {
            healthy,
            message: healthStatus ?? inspect.State.Status,
            checkedAt: new Date().toISOString()
        };
    }

    /**
     * Applies an execution plan on the local Docker engine.
     * 
     * @param plan Execution plan for the local node
     * @returns Nothing.
     */
    async applyPlan(plan: ExecutionPlan): Promise<void> {
        console.debug("[runtime-docker] applyPlan nodeId=%s operations=%d", plan.nodeId, plan.operations.length);
        for (const operation of plan.operations) {
            switch (operation.type) {
                case "pull":
                    await this.pull(operation.image, { registryId: operation.registryId });
                    break;
                case "create":
                    await this.create({
                        instanceId: operation.instanceId,
                        serviceName: operation.serviceName,
                        image: operation.image,
                        command: operation.command,
                        environment: operation.environment,
                        volumes: operation.volumes,
                        networks: operation.networks,
                        ports: operation.ports,
                        resources: operation.resources,
                        secrets: operation.secrets
                    });
                    break;
                case "start":
                    await this.start(operation.instanceId);
                    break;
                case "stop":
                    await this.stop(operation.instanceId);
                    break;
                case "remove":
                    await this.remove(operation.instanceId, operation.force);
                    break;
                default:
                    console.debug("[runtime-docker] applyPlan skipped operation type=%s", operation.type);
            }
        }
    }

    /**
     * Builds Docker port bindings from instance port specs.
     * 
     * @param ports Optional port mappings from the instance spec
     * @returns Docker port binding map
     */
    private buildPortBindings(
        ports?: CreateInstanceSpec["ports"]
    ): Record<string, Array<{ HostPort: string }>> | undefined {
        if (!ports || ports.length === 0) {
            return undefined;
        }

        const bindings: Record<string, Array<{ HostPort: string }>> = {};
        for (const port of ports) {
            const protocol = port.protocol ?? "tcp";
            const key = `${port.containerPort}/${protocol}`;
            bindings[key] = [{ HostPort: String(port.hostPort ?? port.containerPort) }];
        }
        return bindings;
    }

    /**
     * Collects stdout and stderr from a Docker hijacked stream.
     * 
     * @param stream Docker multiplexed stream
     * @returns Combined output text
     */
    private async collectStream(stream: NodeJS.ReadableStream): Promise<string> {
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        return Buffer.concat(chunks).toString("utf8");
    }
}

/**
 * Creates a Docker runtime provider with optional socket overrides.
 * 
 * @param options Docker runtime provider options
 * @returns Configured Docker runtime provider
 */
export function createDockerRuntimeProvider(options?: DockerRuntimeProviderOptions): DockerRuntimeProvider {
    return new DockerRuntimeProvider(options);
}
