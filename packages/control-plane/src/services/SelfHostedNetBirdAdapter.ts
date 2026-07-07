import { Logger } from "../Logger";

const log_netbird = Logger.create("netbird");

import type {
    NetBirdAclRule,
    NetBirdAdapter,
    NetBirdDevice,
    NetBirdGroup,
    NetBirdPolicyEnsureInput
} from "./NetBirdService";

/**
 * Options for the self-hosted NetBird API adapter.
 */
export interface SelfHostedNetBirdAdapterOptions {
    apiUrl: string;
    token?: string;
    fetchImpl?: typeof fetch;
}

interface RawNetBirdPolicy {
    id?: string;
    name?: string;
    rules?: Array<{
        id?: string;
        name?: string;
        enabled?: boolean;
        action?: string;
        bidirectional?: boolean;
        protocol?: string;
        ports?: string[];
        sources?: string[];
        destinations?: string[];
    }>;
}

interface RawNetBirdGroup {
    id?: string;
    name?: string;
    peers?: string[];
}

/**
 * NetBird adapter that talks to a self-hosted management API.
 */
export class SelfHostedNetBirdAdapter implements NetBirdAdapter {
    private readonly apiUrl: string;
    private readonly token?: string;
    private readonly fetchImpl: typeof fetch;

    /**
     * Creates a self-hosted NetBird adapter.
     *
     * @param options API URL, token, and optional fetch implementation
     */
    constructor(options: SelfHostedNetBirdAdapterOptions) {
        this.apiUrl = options.apiUrl.replace(/\/+$/, "");
        this.token = options.token;
        this.fetchImpl = options.fetchImpl ?? fetch;
    }

    /**
     * Lists NetBird groups from the self-hosted API.
     *
     * @returns NetBird groups
     */
    async listGroups(): Promise<NetBirdGroup[]> {
        const payload = await this.request<{ items?: NetBirdGroup[]; groups?: NetBirdGroup[] }>("/groups");
        return payload.items ?? payload.groups ?? [];
    }

    /**
     * Lists NetBird devices from the self-hosted API.
     *
     * @returns NetBird devices
     */
    async listDevices(): Promise<NetBirdDevice[]> {
        const payload = await this.request<{ items?: NetBirdDevice[]; devices?: NetBirdDevice[] }>("/peers");
        return payload.items ?? payload.devices ?? [];
    }

    /**
     * Lists NetBird ACL rules from the self-hosted API.
     *
     * @returns NetBird ACL rules
     */
    async listAcls(): Promise<NetBirdAclRule[]> {
        const payload = await this.request<{ items?: RawNetBirdPolicy[]; rules?: RawNetBirdPolicy[] }>("/policies");
        const policies = payload.items ?? payload.rules ?? [];
        return policies.flatMap((policy) => SelfHostedNetBirdAdapter.mapPolicy(policy));
    }

    /**
     * Ensures a NetBird group exists on the self-hosted API.
     *
     * @param name Group name
     * @returns Created or existing group
     */
    async ensureGroup(name: string): Promise<NetBirdGroup> {
        const existing = (await this.listGroups()).find((group) => group.name === name);
        if (existing) {
            return existing;
        }

        const created = await this.request<NetBirdGroup>("/groups", {
            method: "POST",
            body: JSON.stringify({ name, peers: [] })
        });

        return created;
    }

    /**
     * Ensures an access policy exists for the provided groups.
     *
     * @param input Policy definition
     * @returns Created or existing ACL metadata
     */
    async ensurePolicy(input: NetBirdPolicyEnsureInput): Promise<NetBirdAclRule> {
        const existingPolicies = await this.request<{ items?: RawNetBirdPolicy[] }>("/policies");
        const policies = existingPolicies.items ?? [];
        const existing = policies.find((policy) => policy.name === input.name);

        if (existing) {
            const mapped = SelfHostedNetBirdAdapter.mapPolicy(existing);
            if (mapped[0]) {
                return mapped[0];
            }
        }

        const created = await this.request<RawNetBirdPolicy>("/policies", {
            method: "POST",
            body: JSON.stringify({
                name: input.name,
                description: `Managed by Naulite for ${input.name}`,
                enabled: true,
                source_posture_checks: [],
                rules: [{
                    name: `${input.name}-rule`,
                    description: `Allow traffic for ${input.name}`,
                    enabled: true,
                    action: "accept",
                    bidirectional: input.bidirectional ?? true,
                    protocol: input.protocol ?? "tcp",
                    ports: input.ports ?? [],
                    sources: input.sourceGroupIds,
                    destinations: input.destinationGroupIds
                }]
            })
        });

        const mapped = SelfHostedNetBirdAdapter.mapPolicy(created);
        if (!mapped[0]) {
            throw new Error(`NetBird policy ${input.name} was created without rules.`);
        }

        return mapped[0];
    }

    /**
     * Assigns peers to a NetBird group.
     *
     * @param groupId NetBird group identifier
     * @param peerIds Peer identifiers to assign
     * @returns Updated group metadata
     */
    async assignPeersToGroup(groupId: string, peerIds: string[]): Promise<NetBirdGroup> {
        const groups = await this.listGroups();
        const existing = groups.find((group) => group.id === groupId);

        if (!existing) {
            throw new Error(`NetBird group ${groupId} was not found.`);
        }

        const mergedPeers = [...new Set([...existing.peers, ...peerIds])];
        const updated = await this.request<RawNetBirdGroup>(`/groups/${encodeURIComponent(groupId)}`, {
            method: "PUT",
            body: JSON.stringify({
                id: groupId,
                name: existing.name,
                peers: mergedPeers
            })
        });

        return {
            id: updated.id ?? groupId,
            name: updated.name ?? existing.name,
            peers: updated.peers ?? mergedPeers
        };
    }

    /**
     * Creates a reusable setup key for agent enrollment.
     *
     * @param name Setup key label
     * @returns Created setup key metadata
     */
    async createSetupKey(name: string): Promise<{ id: string; key: string; name: string }> {
        return this.request("/setup-keys", {
            method: "POST",
            body: JSON.stringify({
                name,
                type: "reusable",
                expires_in: 0,
                auto_groups: [],
                usage_limit: 0
            })
        });
    }

    /**
     * Lists setup keys from the self-hosted NetBird API.
     *
     * @returns Setup key records
     */
    async listSetupKeys(): Promise<Array<{ id: string; name: string }>> {
        const payload = await this.request<{ items?: Array<{ id: string; name: string }> }>("/setup-keys");
        return payload.items ?? [];
    }

    /**
     * Revokes a setup key by id.
     *
     * @param setupKeyId Setup key identifier
     * @returns Nothing.
     */
    async revokeSetupKey(setupKeyId: string): Promise<void> {
        await this.request(`/setup-keys/${encodeURIComponent(setupKeyId)}`, {
            method: "DELETE"
        });
    }

    /**
     * Maps a raw NetBird policy payload into ACL metadata.
     *
     * @param policy Raw policy payload
     * @returns ACL metadata entries
     */
    private static mapPolicy(policy: RawNetBirdPolicy): NetBirdAclRule[] {
        const rules = policy.rules ?? [];

        return rules.map((rule, index) => ({
            id: rule.id ?? `${policy.id ?? policy.name ?? "policy"}-${index}`,
            name: policy.name ?? rule.name ?? `policy-${index}`,
            sourceGroups: rule.sources ?? [],
            destinationGroups: rule.destinations ?? [],
            ports: (rule.ports ?? []).map((port) => Number(port)).filter((port) => Number.isFinite(port)),
            protocol: rule.protocol === "udp" ? "udp" : "tcp"
        }));
    }

    /**
     * Performs an authenticated request against the self-hosted NetBird API.
     *
     * @param path API path relative to the configured base URL
     * @param init Optional fetch init overrides
     * @returns Parsed JSON response body
     */
    private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
        const headers = new Headers(init.headers);
        headers.set("Accept", "application/json");

        if (!headers.has("Content-Type") && init.body) {
            headers.set("Content-Type", "application/json");
        }

        if (this.token) {
            headers.set("Authorization", `Token ${this.token}`);
        }

        const response = await this.fetchImpl(`${this.apiUrl}${path}`, {
            ...init,
            headers
        });

        if (!response.ok) {
            log_netbird.debug("api request failed status=%d path=%s base=%s",
                response.status,
                path,
                this.apiUrl
            );
            throw new Error(`NetBird API request failed with status ${response.status}.`);
        }

        return await response.json() as T;
    }
}
