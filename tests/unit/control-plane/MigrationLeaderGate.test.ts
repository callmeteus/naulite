import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { DatabaseProvider } from "../../../packages/control-plane/src/database/DatabaseProvider";
import { MigrationRunner } from "../../../packages/control-plane/src/database/MigrationRunner";

describe("Migration leader gate", () => {
    let databasePath = "";

    afterEach(async () => {
        if (databasePath) {
            const provider = new DatabaseProvider();
            await provider.disconnect().catch(() => undefined);
            databasePath = "";
        }
    });

    it("reports no pending migrations after sqlite bootstrap migrate", async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), "naulite-migration-gate-"));
        databasePath = path.join(tempDir, "control-plane.db");
        const provider = new DatabaseProvider();

        await provider.connect({
            dialect: "sqlite",
            url: `sqlite://${databasePath}`
        });
        await provider.migrate();

        await expect(provider.hasPendingMigrations()).resolves.toBe(false);
        await provider.disconnect();
    });

    it("detects pending migrations before migrate runs", async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), "naulite-migration-gate-"));
        databasePath = path.join(tempDir, "control-plane.db");
        const provider = new DatabaseProvider();

        await provider.connect({
            dialect: "sqlite",
            url: `sqlite://${databasePath}`
        });

        const runner = new MigrationRunner(provider.getSequelize(), provider.getDialect());
        await expect(runner.hasPendingMigrations()).resolves.toBe(true);

        await provider.migrate();
        await expect(provider.hasPendingMigrations()).resolves.toBe(false);
        await provider.disconnect();
    });

    it("waits until migrations are applied without running migrate", async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), "naulite-migration-gate-"));
        databasePath = path.join(tempDir, "control-plane.db");
        const provider = new DatabaseProvider();

        await provider.connect({
            dialect: "sqlite",
            url: `sqlite://${databasePath}`
        });
        await provider.migrate();

        const runner = new MigrationRunner(provider.getSequelize(), provider.getDialect());
        await expect(runner.waitUntilApplied(10, 1_000)).resolves.toBeUndefined();
        await provider.disconnect();
    });
});
