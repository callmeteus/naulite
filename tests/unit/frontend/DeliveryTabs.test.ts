import { describe, expect, it } from "vitest";

import { resolveDeliveryTab } from "../../../packages/ui/packages/frontend/src/utils/DeliveryTabs";

describe("DeliveryTabs", () => {
    it("selects gitops for the gitops delivery path", () => {
        expect(resolveDeliveryTab("/delivery/gitops")).toBe("gitops");
    });

    it("selects pipeline for the pipeline delivery path", () => {
        expect(resolveDeliveryTab("/delivery/pipeline")).toBe("pipeline");
    });
});
