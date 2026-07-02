import { readFile } from "node:fs/promises";
import path from "node:path";

import { ComposeParser } from "@platform/control-plane";
import { describe, expect, it } from "vitest";

const fixturePath = path.resolve(
    process.cwd(),
    "tests/fixtures/manifests/minimal.compose.yml"
);

describe("ComposeParser", () => {
    const parser = new ComposeParser();

    it("parses the minimal compose fixture into a validated manifest", async () => {
        const yamlContent = await readFile(fixturePath, "utf8");
        const manifest = parser.parse(yamlContent);

        expect(manifest.name).toBe("minimal");
        expect(manifest.services.web?.image).toBe("nginx:1.27-alpine");
        expect(manifest.services.web?.ports).toEqual(["8080:80"]);
        expect(manifest.services.web?.capabilities).toEqual([]);
        expect(manifest.volumes).toEqual({});
        expect(manifest.networks).toEqual({});
    });

    it("throws when YAML content is not a top-level object", () => {
        expect(() => parser.parse("just a string")).toThrow(
            "Manifest YAML must contain a top-level object."
        );
    });
});
