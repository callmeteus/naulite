import { describe, expect, it, vi } from "vitest";

import type { ControlPlaneStore } from "../../../packages/control-plane/src/database/ControlPlaneStore";
import { NetBirdEnrollmentService } from "../../../packages/control-plane/src/services/NetBirdEnrollmentService";
import type { SelfHostedNetBirdAdapter } from "../../../packages/control-plane/src/services/SelfHostedNetBirdAdapter";

describe("NetBirdEnrollmentService", () => {
    it("returns the stored setup key without calling NetBird", async () => {
        const store = {
            getClusterSecretValues: vi.fn(async () => ({ key: "existing-setup-key" })),
            upsertClusterSecret: vi.fn()
        } as unknown as ControlPlaneStore;

        const adapter = {
            createSetupKey: vi.fn()
        } as unknown as SelfHostedNetBirdAdapter;

        const service = new NetBirdEnrollmentService(store, adapter);
        const setupKey = await service.ensureSetupKey();

        expect(setupKey).toBe("existing-setup-key");
        expect(adapter.createSetupKey).not.toHaveBeenCalled();
        expect(store.upsertClusterSecret).not.toHaveBeenCalled();
    });

    it("creates and stores a setup key when none exists", async () => {
        const upsertClusterSecret = vi.fn(async () => undefined);
        const store = {
            getClusterSecretValues: vi.fn(async () => null),
            upsertClusterSecret
        } as unknown as ControlPlaneStore;

        const adapter = {
            createSetupKey: vi.fn(async () => ({
                id: "key-1",
                key: "generated-setup-key",
                name: "naulite-agents"
            }))
        } as unknown as SelfHostedNetBirdAdapter;

        const service = new NetBirdEnrollmentService(store, adapter);
        const setupKey = await service.ensureSetupKey();

        expect(setupKey).toBe("generated-setup-key");
        expect(adapter.createSetupKey).toHaveBeenCalledWith("naulite-agents");
        expect(upsertClusterSecret).toHaveBeenCalledWith(expect.objectContaining({
            name: "netbird/setup-key",
            keys: ["key"],
            value: { key: "generated-setup-key" }
        }));
    });
});
