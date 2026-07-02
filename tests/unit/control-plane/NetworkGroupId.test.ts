import { NetworkGroupId } from "@platform/control-plane";
import { describe, expect, it } from "vitest";

describe("control-plane NetworkGroupId", () => {
    it("builds a stable network group id from manifest and network keys", () => {
        expect(NetworkGroupId.build("rushpedia", "internal")).toBe("rushpedia-internal");
        expect(NetworkGroupId.build("bookstore", "app")).toBe("bookstore-app");
    });

    it("parses a network group id back into manifest and network parts", () => {
        expect(NetworkGroupId.parse("rushpedia-internal")).toEqual({
            manifestName: "rushpedia",
            networkKey: "internal"
        });
        expect(NetworkGroupId.parse("invalid")).toBeNull();
        expect(NetworkGroupId.parse("-missing-manifest")).toBeNull();
    });
});
