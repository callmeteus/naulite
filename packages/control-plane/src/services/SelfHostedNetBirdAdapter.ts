import type {
    NetBirdAclRule,
    NetBirdAdapter,
    NetBirdDevice,
    NetBirdGroup
} from "./NetBirdService.js";

/**
 * Options for the self-hosted NetBird API adapter.
 */
export interface SelfHostedNetBirdAdapterOptions {
    apiUrl: string;
    token?: string;
    fetchImpl?: typeof fetch;
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
        const payload = await this.request<{ items?: NetBirdAclRule[]; rules?: NetBirdAclRule[] }>("/policies");
        return payload.items ?? payload.rules ?? [];
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
            body: JSON.stringify({ name })
        });

        return created;
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
            console.debug(
                "[netbird] api request failed status=%d path=%s base=%s",
                response.status,
                path,
                this.apiUrl
            );
            throw new Error(`NetBird API request failed with status ${response.status}.`);
        }

        return await response.json() as T;
    }
}
