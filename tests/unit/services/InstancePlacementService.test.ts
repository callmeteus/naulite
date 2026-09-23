import { describe, expect, it } from "vitest";

import { InstancePlacementService } from "../../../packages/control-plane/src/services/InstancePlacementService";

describe("InstancePlacementService", () => {
    it("allows reschedule when placement is not pinned", () => {
        expect(InstancePlacementService.allowsRescheduleAwayFromNode(undefined)).toBe(true);
        expect(InstancePlacementService.allowsRescheduleAwayFromNode({})).toBe(true);
    });

    it("blocks reschedule for target pins and target groups", () => {
        expect(InstancePlacementService.allowsRescheduleAwayFromNode({
            placement: {
                target: "cloop-host"
            }
        })).toBe(false);

        expect(InstancePlacementService.allowsRescheduleAwayFromNode({
            placement: {
                targetGroup: "builders"
            }
        })).toBe(false);
    });
});
