import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { GitSourceRepository } from "../../../packages/control-plane/src/gitops/GitSourceRepository";

class FakeSecretsService {
    async resolveValues(_name: string) {
        return null;
    }
}

describe("GitSourceRepository", () => {
    it("parses github shorthand and default compose.yaml", () => {
        const parsed = GitSourceRepository.parseSpec("github:techtail/rushpedia");
        expect(parsed.kind).toBe("git");
        expect((parsed as any).cloneUrl).toBe("https://github.com/techtail/rushpedia.git");
        expect((parsed as any).filePath).toBe("compose.yaml");
    });

    it("parses git: host shorthand", () => {
        const parsed = GitSourceRepository.parseSpec("git:gitlab.com/group/rushpedia#main");
        expect(parsed.kind).toBe("git");
        expect((parsed as any).cloneUrl).toBe("https://gitlab.com/group/rushpedia.git");
        expect((parsed as any).ref).toBe("main");
    });

    it("parses ref + subpath after #", () => {
        const parsed = GitSourceRepository.parseSpec("github:o/r#main/deploy/compose.yaml");
        expect(parsed.kind).toBe("git");
        expect((parsed as any).ref).toBe("main");
        expect((parsed as any).filePath).toBe("deploy/compose.yaml");
    });

    it("resolves local paths relative to baseDir", async () => {
        const dir = await mkdtemp(path.join(tmpdir(), "naulite-git-src-"));
        const file = path.join(dir, "compose.yaml");
        await writeFile(file, "name: local\nservices:\n  api:\n    image: api:1\n", "utf8");

        const result = await GitSourceRepository.resolveComposeFile(
            new FakeSecretsService() as any,
            { spec: "./compose.yaml", baseDir: dir }
        );

        expect(result.sourceId).toMatch(/^local:/);
        expect(result.yaml).toMatch(/name: local/);
    });
});

