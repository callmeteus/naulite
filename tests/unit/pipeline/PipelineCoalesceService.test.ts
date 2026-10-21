import { afterEach, describe, expect, it, vi } from "vitest";

import { PipelineCoalesceService } from "../../../packages/control-plane/src/services/pipeline/PipelineCoalesceService";

describe("PipelineCoalesceService", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it("deduplicates delivery id", async () => {
        const fired = vi.fn();

        await PipelineCoalesceService.schedule("m:master:all", 60_000, "delivery-1", fired);
        await PipelineCoalesceService.schedule("m:master:all", 60_000, "delivery-1", fired);

        expect(fired).not.toHaveBeenCalled();
    });

    it("fires once after the coalesce window", async () => {
        vi.useFakeTimers();
        const fired = vi.fn(async () => {
            // noop
        });

        await PipelineCoalesceService.schedule("m:branch:all", 1000, "delivery-2", fired);
        await vi.advanceTimersByTimeAsync(1000);

        expect(fired).toHaveBeenCalledTimes(1);
    });

    it("maps delivery id to run id while running", async () => {
        PipelineCoalesceService.markRunning("m:branch:all", "run-abc");

        await PipelineCoalesceService.schedule("m:branch:all", 1000, "delivery-3", async () => {
            // noop
        });

        expect(PipelineCoalesceService.findRunByDeliveryId("delivery-3")).toBe("run-abc");
    });
});
