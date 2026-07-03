import type { ControlPlaneStore } from "../database/ControlPlaneStore";

import type { NetBirdAdapter } from "./NetBirdService";

const SETUP_KEY_SECRET_NAME = "netbird/setup-key";

/**
 * Manages reusable NetBird setup keys for agent enrollment.
 */
export class NetBirdEnrollmentService {
    /**
     * Creates the enrollment service.
     *
     * @param store Control plane store
     * @param adapter NetBird adapter used for setup key provisioning
     */
    constructor(
        private readonly store: ControlPlaneStore,
        private readonly adapter: NetBirdAdapter
    ) {}

    /**
     * Returns an existing setup key or creates and stores a new reusable key.
     *
     * @returns Setup key value for agent enrollment
     */
    async ensureSetupKey(): Promise<string> {
        const existing = await this.store.getClusterSecretValues(SETUP_KEY_SECRET_NAME);

        if (existing?.key) {
            return existing.key;
        }

        const created = await this.adapter.createSetupKey("platform-agents");
        await this.store.upsertClusterSecret({
            name: SETUP_KEY_SECRET_NAME,
            keys: ["key"],
            value: { key: created.key },
            description: "Internal NetBird enrollment key for platform agents."
        });

        return created.key;
    }
}
