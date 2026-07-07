import { describe, expect, it } from "vitest";

import { parseControlPlaneInstances } from "../../../packages/ui/packages/backend/src/Config";

describe("parseControlPlaneInstances", () => {
    it("parses comma-separated control plane URLs", () => {
        expect(parseControlPlaneInstances(
            "http://control-plane-1:8080,http://control-plane-2:8080"
        )).toEqual([
            "http://control-plane-1:8080",
            "http://control-plane-2:8080"
        ]);
    });

    it("trims whitespace and trailing slashes", () => {
        expect(parseControlPlaneInstances(
            " http://control-plane-1:8080/ , http://control-plane-2:8080/ "
        )).toEqual([
            "http://control-plane-1:8080",
            "http://control-plane-2:8080"
        ]);
    });

    it("falls back to localhost when unset", () => {
        expect(parseControlPlaneInstances(undefined)).toEqual(["http://localhost:8080"]);
    });
});
