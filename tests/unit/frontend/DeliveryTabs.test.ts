import { describe, expect, it } from "vitest";

import { resolveDeliveryTab } from "../../../packages/ui/packages/frontend/src/utils/DeliveryTabs";

describe("DeliveryTabs", () => {
    it("selects gitops for the gitops delivery path", () => {
        expect(resolveDeliveryTab("/delivery/gitops")).toBe("gitops");
    });

    it("selects pipeline for the pipeline delivery path", () => {
        expect(resolveDeliveryTab("/delivery/pipeline")).toBe("pipeline");
    });

    it("selects pipeline for nested run pages", () => {
        expect(resolveDeliveryTab("/runs/minimal-apply-546b0")).toBe("pipeline");
        expect(resolveDeliveryTab("/runs/deploy")).toBe("pipeline");
        expect(resolveDeliveryTab("/runs/build")).toBe("pipeline");
    });
});
