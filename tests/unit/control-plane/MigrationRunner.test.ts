import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import type { Sequelize } from "sequelize";

import { DatabaseProvider } from "../../../packages/control-plane/src/database/DatabaseProvider";
import { MigrationRunner } from "../../../packages/control-plane/src/database/MigrationRunner";
import { ClusterStateModel } from "../../../packages/control-plane/src/database/models/ClusterStateModel";
import { ControlPlaneLeaderModel } from "../../../packages/control-plane/src/database/models/ControlPlaneLeaderModel";

describe("MigrationRunner", () => {
    let databasePath = "";

    afterEach(async () => {
        if (databasePath) {
            const provider = new DatabaseProvider();
            await provider.disconnect().catch(() => undefined);
            databasePath = "";
        }
    });

    it("syncs sqlite schema and records the initial migration", async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), "naulite-migrations-"));
        databasePath = path.join(tempDir, "control-plane.db");
        const provider = new DatabaseProvider();

        await provider.connect({
            dialect: "sqlite",
            url: `sqlite://${databasePath}`
        });

        const result = await provider.migrate();

        expect(result.applied).toContain("001-initial-schema");
        expect(result.pending).toEqual([]);

        const leaderTable = await ControlPlaneLeaderModel.sequelize?.getQueryInterface().tableExists("control_plane_leaders");
        const clusterStateTable = await ClusterStateModel.sequelize?.getQueryInterface().tableExists("cluster_state");

        expect(leaderTable).toBe(true);
        expect(clusterStateTable).toBe(true);

        await provider.disconnect();
    });

    it("lists postgresql migrations for models added after the initial schema", async () => {
        const runner = new MigrationRunner({} as Sequelize, "postgresql");

        const expected = await runner.listExpectedMigrationNames();

        expect(expected).toContain("010-node-provisions");
        expect(expected).toContain("011-container-registry-images");
    });
});
