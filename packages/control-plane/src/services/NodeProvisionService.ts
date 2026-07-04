import { randomUUID } from "node:crypto";

import {
    NodeProvisionSchema,
    type NodeProvision,
    type PaginatedList,
    type PaginationQuery,
    type ProvisionNodeBodySchema,
    type MachineStatus
} from "@platform/shared";
import type { z } from "zod";

import type { ControlPlaneStore } from "../database/ControlPlaneStore";
import { HTTP400Error, HTTP404Error } from "../errors/TreatedError";
import type { NodeProvisionerRegistry } from "../plugins/NodeProvisionerRegistry";

import { NodeProvisionUserDataTemplate } from "./NodeProvisionUserDataTemplate";
import type { NetBirdEnrollmentService } from "./NetBirdEnrollmentService";
import type { LeaderElection } from "./LeaderElection";

type ProvisionNodeInput = z.infer<typeof ProvisionNodeBodySchema>;

const PROVISION_SETUP_KEY_PREFIX = "netbird/provision-setup-key/";
const DEFAULT_STATUS_POLL_INTERVAL_MS = 30_000;

/**
 * Orchestrates cloud node provisioning and correlates agent registration.
 */
export class NodeProvisionService {
    private statusPollTimer: ReturnType<typeof setInterval> | null = null;

    /**
     * Creates the node provision service.
     *
     * @param store Control plane persistence layer
     * @param enrollment NetBird enrollment service
     * @param registry Node provisioner plugin registry
     * @param resolvePublicCpUrl Resolver for the public control plane URL
     */
    constructor(
        private readonly store: ControlPlaneStore,
        private readonly _enrollment: NetBirdEnrollmentService,
        private readonly registry: NodeProvisionerRegistry,
        private readonly resolvePublicCpUrl: () => string
    ) {}

    /**
     * Starts leader-only polling of cloud instance status for in-flight provisions.
     *
     * @param leaderElection Leader election service
     * @param intervalMs Poll interval in milliseconds
     * @returns Nothing.
     */
    startStatusPolling(leaderElection: LeaderElection, intervalMs = DEFAULT_STATUS_POLL_INTERVAL_MS): void {
        if (this.statusPollTimer) {
            return;
        }

        this.statusPollTimer = setInterval(() => {
            if (!leaderElection.isLeader()) {
                return;
            }

            void this.pollActiveProvisions().catch((err) => {
                console.error("[node-provision] status poll failed: %O", err);
            });
        }, intervalMs);

        console.debug("[node-provision] status polling started intervalMs=%d", intervalMs);
    }

    /**
     * Stops cloud instance status polling.
     *
     * @returns Nothing.
     */
    stopStatusPolling(): void {
        if (!this.statusPollTimer) {
            return;
        }

        clearInterval(this.statusPollTimer);
        this.statusPollTimer = null;
        console.debug("[node-provision] status polling stopped");
    }

    /**
     * Polls cloud providers for in-flight provision statuses.
     *
     * @returns Nothing.
     */
    async pollActiveProvisions(): Promise<void> {
        const provisions = await this.store.listNodeProvisionsInFlight();

        for (const provision of provisions) {
            if (!provision.cloudInstanceId) {
                continue;
            }

            const provider = this.registry.get(provision.provider);

            if (!provider) {
                console.debug(
                    "[node-provision] poll skip missing provider provisionId=%s provider=%s",
                    provision.id,
                    provision.provider
                );
                continue;
            }

            const machineStatus = await provider.getStatus(provision.cloudInstanceId, provision.region);
            const nextStatus = mapMachineStatusToProvisionStatus(provision.status, machineStatus);

            if (!nextStatus || nextStatus === provision.status) {
                continue;
            }

            const updated = NodeProvisionSchema.parse({
                ...provision,
                status: nextStatus,
                error: machineStatus === "failed" ? "Cloud instance entered failed state." : provision.error,
                updatedAt: new Date().toISOString()
            });
            await this.store.saveNodeProvision(updated);

            console.debug(
                "[node-provision] poll updated provisionId=%s instanceId=%s status=%s machineStatus=%s",
                provision.id,
                provision.cloudInstanceId,
                nextStatus,
                machineStatus
            );
        }
    }

    /**
     * Creates a provision request and launches cloud machines.
     *
     * @param input Provision request payload
     * @returns Created node provision record
     */
    async provision(input: ProvisionNodeInput): Promise<NodeProvision> {
        const provider = this.registry.get(input.provider);

        if (!provider) {
            throw new HTTP400Error(`Unknown node provisioner provider: ${input.provider}`);
        }

        const now = new Date().toISOString();
        const provisionId = randomUUID();
        const nodeId = randomUUID();
        const setupKey = await this.createProvisionSetupKey(provisionId);
        const cpUrl = this.resolvePublicCpUrl();
        const userData = NodeProvisionUserDataTemplate.render({
            cpUrl,
            setupKey,
            provisionId,
            nodeId,
            labels: input.labels,
            capabilities: input.capabilities
        });

        const record = NodeProvisionSchema.parse({
            id: provisionId,
            provider: input.provider,
            status: "pending",
            nodeId,
            instanceType: input.instanceType,
            amiId: input.amiId,
            labels: input.labels,
            capabilities: input.capabilities,
            region: input.region,
            createdAt: now,
            updatedAt: now
        });

        await this.store.saveNodeProvision(record);

        try {
            const machines = await provider.provision({
                instanceType: input.instanceType,
                imageId: input.amiId,
                labels: input.labels,
                capabilities: input.capabilities,
                count: input.count,
                userData,
                region: input.region,
                subnetId: input.subnetId,
                securityGroupIds: input.securityGroupIds,
                iamInstanceProfile: input.iamInstanceProfile,
                keyName: input.keyName
            });
            const machine = machines[0];

            if (!machine?.cloudInstanceId) {
                throw new Error("Provisioner did not return a cloud instance id.");
            }

            const launching = NodeProvisionSchema.parse({
                ...record,
                cloudInstanceId: machine.cloudInstanceId,
                status: "launching",
                updatedAt: new Date().toISOString()
            });
            await this.store.saveNodeProvision(launching);

            const bootstrapping = NodeProvisionSchema.parse({
                ...launching,
                status: "bootstrapping",
                updatedAt: new Date().toISOString()
            });
            await this.store.saveNodeProvision(bootstrapping);

            console.debug(
                "[node-provision] launched provisionId=%s instanceId=%s nodeId=%s",
                provisionId,
                machine.cloudInstanceId,
                nodeId
            );

            return bootstrapping;
        } catch (err) {
            const failed = NodeProvisionSchema.parse({
                ...record,
                status: "failed",
                error: err instanceof Error ? err.message : String(err),
                updatedAt: new Date().toISOString()
            });
            await this.store.saveNodeProvision(failed);
            throw err;
        }
    }

    /**
     * Lists node provision requests with server-side pagination.
     *
     * @param pagination Pagination query parameters
     * @returns Paginated node provision records
     */
    async listProvisions(pagination: PaginationQuery = { page: 1, limit: 50 }): Promise<PaginatedList<NodeProvision>> {
        return this.store.listNodeProvisions(pagination);
    }

    /**
     * Returns a node provision request by id.
     *
     * @param id Provision identifier
     * @returns Node provision record
     */
    async getProvision(id: string): Promise<NodeProvision> {
        const provision = await this.store.getNodeProvision(id);

        if (!provision) {
            throw new HTTP404Error(`Node provision not found: ${id}`);
        }

        return provision;
    }

    /**
     * Terminates a provisioned cloud machine and marks the request terminated.
     *
     * @param id Provision identifier
     * @returns Updated node provision record
     */
    async terminateProvision(id: string): Promise<NodeProvision> {
        const provision = await this.getProvision(id);
        const provider = this.registry.require(provision.provider);

        if (!provision.cloudInstanceId) {
            throw new HTTP400Error(`Provision ${id} has no cloud instance to terminate.`);
        }

        await provider.terminate(provision.cloudInstanceId, provision.region);

        const terminated = NodeProvisionSchema.parse({
            ...provision,
            status: "terminated",
            updatedAt: new Date().toISOString()
        });
        await this.store.saveNodeProvision(terminated);

        console.debug(
            "[node-provision] terminated provisionId=%s instanceId=%s",
            id,
            provision.cloudInstanceId
        );

        return terminated;
    }

    /**
     * Marks a provision as registered after the agent calls POST /nodes/register.
     *
     * @param provisionId Provision identifier
     * @param nodeId Registered node identifier
     * @returns Updated node provision when found
     */
    async completeRegistration(provisionId: string, nodeId: string): Promise<NodeProvision | null> {
        const provision = await this.store.getNodeProvision(provisionId);

        if (!provision) {
            console.debug("[node-provision] completeRegistration missing provisionId=%s", provisionId);
            return null;
        }

        const registered = NodeProvisionSchema.parse({
            ...provision,
            nodeId,
            status: "registered",
            updatedAt: new Date().toISOString()
        });
        await this.store.saveNodeProvision(registered);

        console.debug(
            "[node-provision] registered provisionId=%s nodeId=%s",
            provisionId,
            nodeId
        );

        return registered;
    }

    /**
     * Validates a provision-scoped setup key.
     *
     * @param provisionId Provision identifier
     * @param setupKey Setup key presented by the agent
     * @returns Whether the setup key is valid for the provision
     */
    async validateProvisionSetupKey(provisionId: string, setupKey: string): Promise<boolean> {
        const stored = await this.store.getClusterSecretValues(`${PROVISION_SETUP_KEY_PREFIX}${provisionId}`);
        return stored?.key === setupKey;
    }

    /**
     * Creates and stores a provision-scoped setup key.
     *
     * @param provisionId Provision identifier
     * @returns Generated setup key
     */
    private async createProvisionSetupKey(provisionId: string): Promise<string> {
        const secretName = `${PROVISION_SETUP_KEY_PREFIX}${provisionId}`;
        const existing = await this.store.getClusterSecretValues(secretName);

        if (existing?.key) {
            return existing.key;
        }

        const setupKey = await this._enrollment.ensureSetupKey();
        await this.store.upsertClusterSecret({
            name: secretName,
            keys: ["key"],
            value: { key: setupKey, provisionId },
            description: `Provision-scoped setup key for node provision ${provisionId}.`
        });

        console.debug("[node-provision] created setup key provisionId=%s", provisionId);
        return setupKey;
    }
}

/**
 * Maps cloud machine status to provision lifecycle status.
 *
 * @param currentStatus Current provision status
 * @param machineStatus Cloud machine status
 * @returns Next provision status when an update is needed
 */
function mapMachineStatusToProvisionStatus(
    currentStatus: NodeProvision["status"],
    machineStatus: MachineStatus
): NodeProvision["status"] | null {
    if (machineStatus === "failed") {
        return "failed";
    }

    if (machineStatus === "terminated" || machineStatus === "stopped") {
        return currentStatus === "registered" ? currentStatus : "failed";
    }

    if (machineStatus === "pending" || machineStatus === "launching") {
        return currentStatus === "pending" ? "launching" : currentStatus;
    }

    if (machineStatus === "running") {
        if (currentStatus === "pending" || currentStatus === "launching") {
            return "bootstrapping";
        }
    }

    return null;
}

/**
 * Creates a node provision service.
 *
 * @param store Control plane persistence layer
 * @param enrollment NetBird enrollment service
 * @param registry Node provisioner plugin registry
 * @param resolvePublicCpUrl Resolver for the public control plane URL
 * @returns Configured node provision service
 */
export function createNodeProvisionService(
    store: ControlPlaneStore,
    enrollment: NetBirdEnrollmentService,
    registry: NodeProvisionerRegistry,
    resolvePublicCpUrl: () => string
): NodeProvisionService {
    return new NodeProvisionService(store, enrollment, registry, resolvePublicCpUrl);
}
