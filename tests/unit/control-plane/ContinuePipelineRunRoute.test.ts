import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const continueRoutePath = path.resolve(
    import.meta.dirname,
    "../../../packages/control-plane/src/routes/runs/[id]/continue.ts"
);

describe("POST /runs/:id/continue", () => {
    it("looks up the run before resolving the host executor", async () => {
        const source = await readFile(continueRoutePath, "utf8");
        const getRunIndex = source.indexOf("PipelineRunService.getRun(req.params.id)");
        const executorIndex = source.indexOf("HostExecutorProvider.get()");

        expect(getRunIndex).toBeGreaterThan(-1);
        expect(executorIndex).toBeGreaterThan(-1);
        expect(getRunIndex).toBeLessThan(executorIndex);
        expect(source).toContain("Pipeline run not found.");
        expect(source).toContain('error: "conflict"');
    });
});
