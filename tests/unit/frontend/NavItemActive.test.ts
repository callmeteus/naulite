import { describe, expect, it } from "vitest";

import { isNavItemActive } from "../../../packages/ui/packages/frontend/src/utils/NavItemActive";

const entrega = {
    path: "/delivery/gitops",
    matchPrefixes: ["/delivery", "/runs"]
};

describe("isNavItemActive", () => {
    it("selects the exact linked path", () => {
        expect(isNavItemActive("/delivery/gitops", entrega)).toBe(true);
    });

    it("selects the delivery pipeline tab", () => {
        expect(isNavItemActive("/delivery/pipeline", entrega)).toBe(true);
    });

    it("selects nested run pages", () => {
        expect(isNavItemActive("/runs/minimal-apply-546b0", entrega)).toBe(true);
        expect(isNavItemActive("/runs/deploy", entrega)).toBe(true);
        expect(isNavItemActive("/runs/build", entrega)).toBe(true);
    });

    it("does not select unrelated routes", () => {
        expect(isNavItemActive("/nodes", entrega)).toBe(false);
        expect(isNavItemActive("/runaway", entrega)).toBe(false);
    });
});
