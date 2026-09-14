import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

import { ManifestMerge } from "../../../packages/control-plane/src/gitops/ManifestMerge";

describe("ManifestMerge.omitService", () => {
    it("removes a base service when overlay sets it to null", () => {
        const baseYaml = [
            "services:",
            "  redis:",
            "    image: redis:7",
            "  backend:",
            "    image: api:1"
        ].join("\n");

        const overlayYaml = [
            "services:",
            "  redis: null",
            "  backend:",
            "    image: api:2"
        ].join("\n");

        const merged = parseYaml(ManifestMerge.mergeYaml(baseYaml, overlayYaml)) as {
            services: Record<string, { image: string }>;
        };

        expect(merged.services.redis).toBeUndefined();
        expect(merged.services.backend.image).toBe("api:2");
    });

    it("keeps base services not mentioned in the overlay", () => {
        const baseYaml = [
            "services:",
            "  redis:",
            "    image: redis:7",
            "  backend:",
            "    image: api:1"
        ].join("\n");

        const overlayYaml = [
            "services:",
            "  backend:",
            "    image: api:2"
        ].join("\n");

        const merged = parseYaml(ManifestMerge.mergeYaml(baseYaml, overlayYaml)) as {
            services: Record<string, { image: string }>;
        };

        expect(merged.services.redis.image).toBe("redis:7");
        expect(merged.services.backend.image).toBe("api:2");
    });
});
