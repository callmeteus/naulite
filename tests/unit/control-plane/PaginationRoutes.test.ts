import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { DatabaseProvider } from "../../../packages/control-plane/src/database/DatabaseProvider";
import { PipelineRunService } from "../../../packages/control-plane/src/services/PipelineRunService";

describe("pagination list endpoints", () => {
    let databaseProvider: DatabaseProvider;

    afterEach(async () => {
        if (databaseProvider) {
            await databaseProvider.disconnect();
        }
    });

    /**
     * Connects an isolated sqlite database for pagination tests.
     *
     * @returns Nothing.
     */
    async function connectDatabase(): Promise<void> {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), "naulite-pagination-"));
        databaseProvider = new DatabaseProvider();
        await databaseProvider.connect({
            dialect: "sqlite",
            url: `sqlite://${path.join(tempDir, "control-plane.db")}`
        });
        await databaseProvider.migrate();
    }

    it("returns paginated pipeline runs with totals", async () => {
        await connectDatabase();

        for (let index = 0; index < 3; index += 1) {
            await PipelineRunService.createRun({
                kind: "ci_build",
                serviceName: `api-${index}`
            });
        }

        const pageOne = await PipelineRunService.listRuns({ page: 1, limit: 2 });
        const pageTwo = await PipelineRunService.listRuns({ page: 2, limit: 2 });

        expect(pageOne.total).toBe(3);
        expect(pageOne.items).toHaveLength(2);
        expect(pageOne.hasMore).toBe(true);
        expect(pageTwo.items).toHaveLength(1);
        expect(pageTwo.hasMore).toBe(false);
    });
});
