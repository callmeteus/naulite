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

    it("syncs sqlite schema and applies versioned SQL migrations", async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), "naulite-migrations-"));
        databasePath = path.join(tempDir, "control-plane.db");
        const provider = new DatabaseProvider();

        await provider.connect({
            dialect: "sqlite",
            url: `sqlite://${databasePath}`
        });

        const result = await provider.migrate();

        expect(result.applied).toContain("016-target-groups");
        expect(result.applied).toContain("017_pipeline_run_gates");
        expect(result.pending).toEqual([]);

        const leaderTable = await ControlPlaneLeaderModel.sequelize?.getQueryInterface().tableExists("control_plane_leaders");
        const clusterStateTable = await ClusterStateModel.sequelize?.getQueryInterface().tableExists("cluster_state");

        expect(leaderTable).toBe(true);
        expect(clusterStateTable).toBe(true);

        await provider.disconnect();
    });

    it("adds missing pipeline_runs columns on an existing sqlite database", async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), "naulite-migrations-upgrade-"));
        databasePath = path.join(tempDir, "control-plane.db");
        const provider = new DatabaseProvider();

        await provider.connect({
            dialect: "sqlite",
            url: `sqlite://${databasePath}`
        });

        await provider.getSequelize().query(`
            CREATE TABLE pipeline_runs (
                id TEXT PRIMARY KEY NOT NULL,
                kind TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        `);

        await provider.migrate();

        const [rows] = await provider.getSequelize().query("PRAGMA table_info(pipeline_runs)");

        expect(Array.isArray(rows)).toBe(true);

        const columnNames = Array.isArray(rows)
            ? rows.flatMap((row) => {
                if (typeof row !== "object" || row === null || !("name" in row)) {
                    return [];
                }

                return [String(row.name)];
            })
            : [];

        expect(columnNames).toContain("created_by");
        expect(columnNames).toContain("gate_step_id");
        expect(columnNames).toContain("pending_plan");
        expect(columnNames).toContain("approved_by");

        await provider.disconnect();
    });

    it("lists postgresql migrations for models added after the initial schema", async () => {
        const runner = new MigrationRunner({} as Sequelize, "postgresql");

        const expected = await runner.listExpectedMigrationNames();

        expect(expected).toContain("010-node-provisions");
        expect(expected).toContain("011-container-registry-images");
        expect(expected).toContain("016-target-groups");
        expect(expected).toContain("017_pipeline_run_gates");
        expect(expected.indexOf("017_pipeline_run_gates")).toBeGreaterThan(
            expected.indexOf("002-pipeline-runs")
        );
    });
});
