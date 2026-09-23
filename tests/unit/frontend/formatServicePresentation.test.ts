import { describe, expect, it } from "vitest";

import {
    formatServiceDisplayName,
    formatServiceDisplayNameFromService
} from "../../../packages/ui/packages/frontend/src/utils/formatServicePresentation";

describe("formatServicePresentation", () => {
    it("joins manifest and service keys for display", () => {
        expect(formatServiceDisplayName("cloop", "agent")).toBe("cloop-agent");
    });

    it("returns the service name when manifest is missing", () => {
        expect(formatServiceDisplayName(null, "agent")).toBe("agent");
    });

    it("formats from a service record", () => {
        expect(formatServiceDisplayNameFromService({
            manifestName: "cloop",
            name: "agent"
        })).toBe("cloop-agent");
    });
});
