import { describe, expect, it } from "vitest";

import { NetworkGroupId } from "@platform/shared";

describe("NetworkGroupId", () => {
    it("generates a NetBird group id from manifest name and network key", () => {
        expect(NetworkGroupId.generate("rushpedia", "internal")).toBe("rushpedia-internal");
        expect(NetworkGroupId.generate("bookstore", "app")).toBe("bookstore-app");
    });

    it("throws when manifest name or network key is empty", () => {
        expect(() => NetworkGroupId.generate("", "internal")).toThrow(
            "manifest name and network key are required"
        );
        expect(() => NetworkGroupId.generate("rushpedia", "   ")).toThrow(
            "manifest name and network key are required"
        );
    });

    it("skips NetBird sync for local-only networks", () => {
        expect(NetworkGroupId.shouldSyncNetBirdGroup({ local: true })).toBe(false);
        expect(NetworkGroupId.shouldSyncNetBirdGroup({ local: false })).toBe(true);
        expect(NetworkGroupId.shouldSyncNetBirdGroup({})).toBe(true);
    });
});
