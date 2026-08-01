import { describe, expect, it, vi } from "vitest";

import { InstanceLifecycleService } from "../../../packages/control-plane/src/services/InstanceLifecycleService";

describe("InstanceLifecycleService", () => {
    it("returns failed when stopping a missing instance", async () => {
        const store = {
            getInstance: vi.fn().mockResolvedValue(null)
        };

        const result = await InstanceLifecycleService.stopInstance(
            store as never,
            {} as never,
            () => 1,
            "missing-instance"
        );

        expect(result).toEqual({
            instanceId: "missing-instance",
            status: "failed",
            message: "Instance not found."
        });
    });

    it("returns failed when removing a missing instance", async () => {
        const store = {
            getInstance: vi.fn().mockResolvedValue(null)
        };

        const result = await InstanceLifecycleService.removeInstance(
            store as never,
            {} as never,
            () => 1,
            "missing-instance"
        );

        expect(result).toEqual({
            instanceId: "missing-instance",
            status: "failed",
            message: "Instance not found."
        });
    });
});
