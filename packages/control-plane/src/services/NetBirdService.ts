import { Logger } from "../Logger";

const log_netbird = Logger.create("netbird");

/**
 * NetBird device metadata.
 */
export interface NetBirdDevice {
    id: string;
    name: string;
    hostname: string;
    groups: string[];
    online: boolean;
}

/**
 * NetBird group metadata.
 */
export interface NetBirdGroup {
    id: string;
    name: string;
    peers: string[];
}

/**
 * NetBird ACL rule metadata.
 */
export interface NetBirdAclRule {
    id: string;
    name: string;
    sourceGroups: string[];
    destinationGroups: string[];
    ports: number[];
    protocol: "tcp" | "udp";
}

/**
 * NetBird topology summary.
 */
export interface NetBirdTopology {
    groups: NetBirdGroup[];
    devices: NetBirdDevice[];
    acls: NetBirdAclRule[];
}

/**
 * Input for ensuring a NetBird access policy.
 */
export interface NetBirdPolicyEnsureInput {
    name: string;
    sourceGroupIds: string[];
    destinationGroupIds: string[];
    ports?: string[];
    protocol?: "tcp" | "udp" | "all";
    bidirectional?: boolean;
}

/**
 * Adapter contract for NetBird API integrations.
 */
export interface NetBirdAdapter {
    /**
     * Lists NetBird groups.
     *
     * @returns NetBird groups
     */
    listGroups(): Promise<NetBirdGroup[]>;

    /**
     * Lists NetBird devices.
     *
     * @returns NetBird devices
     */
    listDevices(): Promise<NetBirdDevice[]>;

    /**
     * Lists NetBird ACL rules.
     *
     * @returns NetBird ACL rules
     */
    listAcls(): Promise<NetBirdAclRule[]>;

    /**
     * Ensures a NetBird group exists.
     *
     * @param name Group name
     * @returns Created or existing group
     */
    ensureGroup(name: string): Promise<NetBirdGroup>;

    /**
     * Ensures an access policy exists for the provided groups.
     *
     * @param input Policy definition
     * @returns Created or existing ACL rule metadata
     */
    ensurePolicy(input: NetBirdPolicyEnsureInput): Promise<NetBirdAclRule>;

    /**
     * Assigns peers to a NetBird group.
     *
     * @param groupId NetBird group identifier
     * @param peerIds Peer identifiers to assign
     * @returns Updated group metadata
     */
    assignPeersToGroup(groupId: string, peerIds: string[]): Promise<NetBirdGroup>;

    /**
     * Creates a reusable setup key for agent enrollment.
     *
     * @param name Setup key label
     * @returns Created setup key metadata
     */
    createSetupKey(name: string): Promise<{ id: string; key: string; name: string }>;
}

/**
 * In-memory mock NetBird adapter used by default.
 */
export class MockNetBirdAdapter implements NetBirdAdapter {
    private readonly groups = new Map<string, NetBirdGroup>();
    private readonly devices = new Map<string, NetBirdDevice>();
    private readonly acls = new Map<string, NetBirdAclRule>();
    private setupKeyCounter = 0;

    /**
     * Lists NetBird groups from the mock store.
     *
     * @returns NetBird groups
     */
    async listGroups(): Promise<NetBirdGroup[]> {
        return [...this.groups.values()];
    }

    /**
     * Lists NetBird devices from the mock store.
     *
     * @returns NetBird devices
     */
    async listDevices(): Promise<NetBirdDevice[]> {
        return [...this.devices.values()];
    }

    /**
     * Lists NetBird ACL rules from the mock store.
     *
     * @returns NetBird ACL rules
     */
    async listAcls(): Promise<NetBirdAclRule[]> {
        return [...this.acls.values()];
    }

    /**
     * Ensures a NetBird group exists in the mock store.
     *
     * @param name Group name
     * @returns Created or existing group
     */
    async ensureGroup(name: string): Promise<NetBirdGroup> {
        const existing = [...this.groups.values()].find((group) => group.name === name);

        if (existing) {
            return existing;
        }

        const group: NetBirdGroup = {
            id: `group-${this.groups.size + 1}`,
            name,
            peers: []
        };
        this.groups.set(group.id, group);
        return group;
    }

    /**
     * Ensures a policy exists in the mock store.
     *
     * @param input Policy definition
     * @returns Created or existing ACL metadata
     */
    async ensurePolicy(input: NetBirdPolicyEnsureInput): Promise<NetBirdAclRule> {
        const existing = [...this.acls.values()].find((acl) => acl.name === input.name);

        if (existing) {
            return existing;
        }

        const acl: NetBirdAclRule = {
            id: `acl-${this.acls.size + 1}`,
            name: input.name,
            sourceGroups: [...input.sourceGroupIds],
            destinationGroups: [...input.destinationGroupIds],
            ports: (input.ports ?? []).map((port) => Number(port)).filter((port) => Number.isFinite(port)),
            protocol: input.protocol === "udp" ? "udp" : "tcp"
        };
        this.acls.set(acl.id, acl);
        return acl;
    }

    /**
     * Assigns peers to a mock group.
     *
     * @param groupId NetBird group identifier
     * @param peerIds Peer identifiers to assign
     * @returns Updated group metadata
     */
    async assignPeersToGroup(groupId: string, peerIds: string[]): Promise<NetBirdGroup> {
        const group = this.groups.get(groupId);

        if (!group) {
            throw new Error(`NetBird group ${groupId} was not found.`);
        }

        const merged = new Set([...group.peers, ...peerIds]);
        const updated: NetBirdGroup = {
            ...group,
            peers: [...merged]
        };
        this.groups.set(groupId, updated);
        return updated;
    }

    /**
     * Creates a mock setup key.
     *
     * @param name Setup key label
     * @returns Created setup key metadata
     */
    async createSetupKey(name: string): Promise<{ id: string; key: string; name: string }> {
        this.setupKeyCounter += 1;
        return {
            id: `setup-key-${this.setupKeyCounter}`,
            key: `mock-setup-key-${this.setupKeyCounter}`,
            name
        };
    }

    /**
     * Registers a mock device for tests and stubs.
     *
     * @param device Device metadata
     * @returns Nothing.
     */
    registerDevice(device: NetBirdDevice): void {
        this.devices.set(device.id, device);
    }

    /**
     * Registers a mock ACL rule for tests and stubs.
     *
     * @param acl ACL rule metadata
     * @returns Nothing.
     */
    registerAcl(acl: NetBirdAclRule): void {
        this.acls.set(acl.id, acl);
    }
}

/**
 * NetBird service exposing groups, devices, ACLs, and topology operations.
 */
export class NetBirdService {
  /**
   * Creates a NetBird service.
   *
   * @param adapter NetBird adapter implementation
   */
    constructor(private readonly adapter: NetBirdAdapter = new MockNetBirdAdapter()) {}

    /**
     * Lists NetBird groups.
     *
     * @returns NetBird groups
     */
    async listGroups(): Promise<NetBirdGroup[]> {
        return this.adapter.listGroups();
    }

    /**
     * Lists NetBird devices.
     *
     * @returns NetBird devices
     */
    async listDevices(): Promise<NetBirdDevice[]> {
        return this.adapter.listDevices();
    }

    /**
     * Lists NetBird ACL rules.
     *
     * @returns NetBird ACL rules
     */
    async listAcls(): Promise<NetBirdAclRule[]> {
        return this.adapter.listAcls();
    }

    /**
     * Returns a topology summary for NetBird resources.
     *
     * @returns NetBird topology summary
     */
    async getTopology(): Promise<NetBirdTopology> {
        const [groups, devices, acls] = await Promise.all([
            this.listGroups(),
            this.listDevices(),
            this.listAcls()
        ]);

        return { groups, devices, acls };
    }

    /**
     * Ensures an internal exposure group exists.
     *
     * @param groupName NetBird group name
     * @returns Created or existing group
     */
    async ensureInternalGroup(groupName: string): Promise<NetBirdGroup> {
        return this.adapter.ensureGroup(groupName);
    }

    /**
     * Ensures intra-group access for a NetBird network group.
     *
     * @param groupId NetBird group identifier
     * @param policyName Stable policy name
     * @param ports Optional destination ports
     * @returns Created or existing ACL metadata
     */
    async ensureGroupAccessPolicy(
        groupId: string,
        policyName: string,
        ports: string[] = []
    ): Promise<NetBirdAclRule> {
        log_netbird.debug("ensureGroupAccessPolicy policy=%s group=%s ports=%o",
            policyName,
            groupId,
            ports
        );

        return this.adapter.ensurePolicy({
            name: policyName,
            sourceGroupIds: [groupId],
            destinationGroupIds: [groupId],
            ports,
            protocol: "tcp",
            bidirectional: true
        });
    }

    /**
     * Ensures registered agent peers are assigned to the platform nodes group.
     *
     * @param peerIds NetBird peer identifiers from registered nodes
     * @returns Updated platform nodes group
     */
    async syncPlatformNodePeers(peerIds: string[]): Promise<NetBirdGroup> {
        const group = await this.adapter.ensureGroup("naulite-nodes");
        const uniquePeerIds = [...new Set(peerIds.filter((peerId) => peerId.length > 0))];

        if (uniquePeerIds.length === 0) {
            log_netbird.debug("syncPlatformNodePeers skipped empty peer list");
            return group;
        }

        log_netbird.debug("syncPlatformNodePeers group=%s peers=%d",
            group.id,
            uniquePeerIds.length
        );

        return this.adapter.assignPeersToGroup(group.id, uniquePeerIds);
    }
}
