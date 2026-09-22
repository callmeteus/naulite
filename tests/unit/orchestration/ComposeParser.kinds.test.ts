import { ComposeParser, ManifestValidationError } from "@naulite/control-plane";
import { describe, expect, it } from "vitest";

describe("ComposeParser.kinds", () => {
    const parser = new ComposeParser();

    it("accepts apps, services, and tasks in the same document", () => {
        const yaml = [
            "name: catalog",
            "apps:",
            "  child:",
            "    path: ./child",
            "services:",
            "  web:",
            "    image: nginx:1.27-alpine",
            "    x-naulite:",
            "      target: node-a",
            "tasks:",
            "  - name: build",
            "    module: build",
            "    command: [yarn, build]",
            "    outputs: [dist/]"
        ].join("\n");

        const manifest = parser.parse(yaml);

        expect(manifest.apps?.child.path).toBe("./child");
        expect(manifest.services.web?.image).toBe("nginx:1.27-alpine");
        expect(manifest.tasks).toHaveLength(1);
    });

    it("rejects legacy cluster placement", () => {
        const yaml = [
            "name: legacy",
            "services:",
            "  web:",
            "    image: nginx:1.27-alpine",
            "    x-naulite:",
            "      cluster:",
            "        labels:",
            "          region: us-east"
        ].join("\n");

        expect(() => parser.parse(yaml)).toThrow(ManifestValidationError);
    });

    it("rejects target and targetGroup together", () => {
        const yaml = [
            "name: bad-placement",
            "services:",
            "  web:",
            "    image: nginx:1.27-alpine",
            "    x-naulite:",
            "      target: node-a",
            "      targetGroup: workers"
        ].join("\n");

        expect(() => parser.parse(yaml)).toThrow(ManifestValidationError);
    });

    it("maps network_mode from compose services", () => {
        const yaml = [
            "name: cloop",
            "services:",
            "  agent:",
            "    image: naulite-cr/cloop-agent:latest",
            "    network_mode: host",
            "    x-naulite:",
            "      target: cloop-host"
        ].join("\n");

        const manifest = parser.parse(yaml);

        expect(manifest.services.agent?.networkMode).toBe("host");
        expect(manifest.services.agent?.placement?.target).toBe("cloop-host");
    });
});
