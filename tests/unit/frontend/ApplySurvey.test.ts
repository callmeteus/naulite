import { describe, expect, it } from "vitest";

import { parseManifestVarNames } from "../../../packages/ui/packages/frontend/src/utils/RunPresentation";

describe("ApplySurvey", () => {
    it("parses top-level vars keys from manifest YAML", () => {
        const yaml = [
            "name: demo",
            "vars:",
            "  IMAGE_TAG:",
            "  REGISTRY_URL: https://example.com",
            "services:",
            "  web:",
            "    image: nginx"
        ].join("\n");

        expect(parseManifestVarNames(yaml)).toEqual(["IMAGE_TAG", "REGISTRY_URL"]);
    });

    it("returns an empty list when vars are not declared", () => {
        const yaml = "name: demo\nservices:\n  web:\n    image: nginx";

        expect(parseManifestVarNames(yaml)).toEqual([]);
    });
});
