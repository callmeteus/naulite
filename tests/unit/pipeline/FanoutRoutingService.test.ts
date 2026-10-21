import { describe, expect, it } from "vitest";

import { FanoutRoutingService } from "../../../packages/control-plane/src/services/pipeline/FanoutRoutingService";

describe("FanoutRoutingService", () => {
    it("selects all scope for matching repo", () => {
        const scope = FanoutRoutingService.resolveScope([
            {
                repos: ["even7hq/luckymaker"],
                select: "all"
            }
        ], "even7hq/luckymaker");

        expect(scope).toEqual({
            mode: "all"
        });
    });

    it("captures tenant name from repo pattern", () => {
        const scope = FanoutRoutingService.resolveScope([
            {
                repos: ["even7hq/tenant-*"],
                capture: "^tenant-(.+)$",
                select: {
                    matchLabels: {
                        name: "${capture.1}"
                    }
                }
            }
        ], "even7hq/tenant-mania");

        expect(scope).toEqual({
            mode: "matchLabels",
            matchLabels: {
                name: "mania"
            }
        });
    });

    it("filters items by matchLabels name", () => {
        const items = [
            {
                name: "mania"
            },
            {
                name: "vvs"
            }
        ];

        const filtered = FanoutRoutingService.filterItems(items, {
            mode: "matchLabels",
            matchLabels: {
                name: "mania"
            }
        });

        expect(filtered).toHaveLength(1);
        expect(filtered[0].name).toBe("mania");
    });
});
