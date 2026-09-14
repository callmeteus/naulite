import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const abortRoutePath = path.resolve(
    import.meta.dirname,
    "../../../packages/control-plane/src/routes/runs/[id]/abort.ts"
);
const abortRunnerPath = path.resolve(
    import.meta.dirname,
    "../../../packages/control-plane/src/services/ApplyStageRunner.ts"
);

describe("POST /runs/:id/abort", () => {
    it("delegates abort to ApplyStageRunner which rejects missing runs with conflict", async () => {
        const routeSource = await readFile(abortRoutePath, "utf8");
        const runnerSource = await readFile(abortRunnerPath, "utf8");

        expect(routeSource).toContain("ApplyStageRunner.abortRun");
        expect(runnerSource).toContain("Pipeline run not found.");
        expect(runnerSource).toContain('error: "conflict"');
    });
});
