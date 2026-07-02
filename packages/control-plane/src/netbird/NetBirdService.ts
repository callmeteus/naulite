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
}

/**
 * In-memory mock NetBird adapter used by default.
 */
export class MockNetBirdAdapter implements NetBirdAdapter {
    private readonly groups = new Map<string, NetBirdGroup>();
    private readonly devices = new Map<string, NetBirdDevice>();
    private readonly acls = new Map<string, NetBirdAclRule>();

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
 * NetBird service exposing groups, devices, ACLs, and topology stubs.
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
}
