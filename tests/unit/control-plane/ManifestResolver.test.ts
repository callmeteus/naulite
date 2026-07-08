import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ManifestResolver } from "../../../packages/control-plane/src/gitops/ManifestResolver";

class FakeSecretsService {
    async resolveValues(_name: string) {
        return null;
    }
}

describe("ManifestResolver", () => {
    it("applies root extends (local file) and merges local on top", async () => {
        const dir = await mkdtemp(path.join(tmpdir(), "naulite-resolver-"));
        const basePath = path.join(dir, "base.compose.yaml");
        await writeFile(basePath, [
            "name: base",
            "services:",
            "  api:",
            "    image: api:1",
            "  worker:",
            "    image: worker:1"
        ].join("\n"));

        const yaml = [
            "name: app",
            "extends:",
            "  file: ./base.compose.yaml",
            "services:",
            "  api:",
            "    image: api:2"
        ].join("\n");

        const result = await ManifestResolver.resolve({
            yaml,
            baseDir: dir,
            secrets: new FakeSecretsService() as any
        });

        expect(result.resolvedYaml).toMatch(/name: app/);
        expect(result.resolvedYaml).toMatch(/worker:/);
        expect(result.resolvedYaml).toMatch(/image: api:2/);
    });

    it("applies service-level extends and merges arrays + maps", async () => {
        const dir = await mkdtemp(path.join(tmpdir(), "naulite-resolver-"));
        const basePath = path.join(dir, "compose.yaml");
        await writeFile(basePath, [
            "name: rushpedia",
            "services:",
            "  api:",
            "    image: api:base",
            "    capabilities:",
            "      - runtime",
            "    environment:",
            "      NODE_ENV: production"
        ].join("\n"));

        const yaml = [
            "name: rushpedia",
            "vars:",
            "  PLATFORM_NODE_AMOUNT: \"5\"",
            "services:",
            "  api:",
            "    extends:",
            "      file: ./compose.yaml",
            "      service: api",
            "    capabilities:",
            "      - storage",
            "    environment:",
            "      LOG_LEVEL: debug",
            "    deploy:",
            "      replicas: ${PLATFORM_NODE_AMOUNT}"
        ].join("\n");

        const result = await ManifestResolver.resolve({
            yaml,
            baseDir: dir,
            secrets: new FakeSecretsService() as any
        });

        expect(result.resolvedYaml).toMatch(/capabilities:\n\s+- runtime\n\s+- storage/);
        expect(result.resolvedYaml).toMatch(/NODE_ENV: production/);
        expect(result.resolvedYaml).toMatch(/LOG_LEVEL: debug/);
        expect(result.resolvedYaml).toMatch(/replicas: 5/);
        expect(result.resolvedYaml).not.toMatch(/extends:/);
        expect(result.resolvedYaml).not.toMatch(/vars:/);
    });
});

