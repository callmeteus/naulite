import { describe, expect, it } from "vitest";

import { CanaryRolloutService } from "../../../packages/control-plane/src/services/pipeline/CanaryRolloutService";

describe("CanaryRolloutService", () => {
    it("runs canary partition before remainder in parallel", async () => {
        const order: string[] = [];

        const results = await CanaryRolloutService.executeRollout(
            [
                {
                    id: "a",
                    level: "canary"
                },
                {
                    id: "b",
                    level: "crucial"
                },
                {
                    id: "c",
                    level: "lazy"
                }
            ],
            {
                partitionBy: "level",
                order: ["canary", "crucial", "lazy"],
                parallel: true,
                soak: "0s"
            },
            (item) => item.level,
            async (item) => {
                order.push(item.id);
                return {
                    ok: true
                };
            }
        );

        expect(results.every((result) => result.ok)).toBe(true);
        expect(order[0]).toBe("a");
        expect(order).toContain("b");
        expect(order).toContain("c");
    });
});
