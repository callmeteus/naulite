import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import type { Sequelize } from "sequelize";
import type { DatabaseDialect, DatabaseMigrationResult } from "@naulite/shared";

import { Logger } from "../Logger";
import { SchemaMigrationModel } from "./models/index";
const logMigrations = Logger.create("migrations");

const migrationsRoot = join(dirname(fileURLToPath(import.meta.url)), "migrations");

/**
 * PostgreSQL advisory lock id so HA nodes never apply migrations concurrently.
 */
const POSTGRES_MIGRATION_ADVISORY_LOCK_ID = 0x504c5446;

/**
 * Applies versioned SQL migrations for PostgreSQL HA deployments.
 */
export class MigrationRunner {
    /**
     * Creates a migration runner.
     *
     * @param sequelize Connected Sequelize instance
     * @param dialect Active database dialect
     */
    constructor(
        private readonly sequelize: Sequelize,
        private readonly dialect: DatabaseDialect
    ) {}

    /**
     * Lists migration names expected for the active dialect.
     *
     * @returns Sorted migration names from disk
     */
    async listExpectedMigrationNames(): Promise<string[]> {
        if (this.dialect === "sqlite") {
            return ["001-initial-schema"];
        }

        const migrationDir = join(migrationsRoot, "postgresql");
        const files = (await readdir(migrationDir))
            .filter((fileName) => fileName.endsWith(".sql"))
            .sort();

        return files.map((fileName) => fileName.replace(/\.sql$/, ""));
    }

    /**
     * Lists migration names already recorded in schema_migrations.
     *
     * @returns Applied migration names
     */
    async listAppliedMigrationNames(): Promise<string[]> {
        if (this.dialect === "sqlite") {
            try {
                const existing = await SchemaMigrationModel.findByPk("001-initial-schema");
                return existing ? ["001-initial-schema"] : [];
            } catch {
                return [];
            }
        }

        try {
            const rows = await SchemaMigrationModel.findAll({
                attributes: ["name"],
                order: [["name", "ASC"]]
            });

            return rows.map((row) => row.name);
        } catch {
            return [];
        }
    }

    /**
     * Returns true when disk migrations are not fully applied in the database.
     *
     * @returns Whether pending migrations exist
     */
    async hasPendingMigrations(): Promise<boolean> {
        const expected = await this.listExpectedMigrationNames();
        const applied = new Set(await this.listAppliedMigrationNames());
        return expected.some((name) => !applied.has(name));
    }

    /**
     * Waits until all expected migrations are applied without acquiring the advisory lock.
     *
     * @param pollMs Poll interval in milliseconds
     * @param timeoutMs Maximum wait time in milliseconds
     * @returns Nothing.
     * @throws {Error} {@link Error}
     */
    async waitUntilApplied(pollMs = 1_000, timeoutMs = 300_000): Promise<void> {
        const startedAt = Date.now();

        while (await this.hasPendingMigrations()) {
            if (Date.now() - startedAt > timeoutMs) {
                throw new Error("Timed out waiting for database migrations to be applied.");
            }

            logMigrations.debug("waiting for leader to apply pending migrations dialect=%s", this.dialect);
            await new Promise((resolve) => {
                setTimeout(resolve, pollMs);
            });
        }
    }

    /**
     * Applies pending SQL migrations for the active dialect.
     *
     * @returns Migration result summary
     */
    async run(): Promise<DatabaseMigrationResult> {
        if (this.dialect === "sqlite") {
            await this.sequelize.sync();
            const migrationName = "001-initial-schema";
            const existing = await SchemaMigrationModel.findByPk(migrationName);

            if (!existing) {
                await SchemaMigrationModel.create({
                    name: migrationName,
                    appliedAt: new Date().toISOString()
                });

                return {
                    applied: [migrationName],
                    pending: []
                };
            }

            return {
                applied: [migrationName],
                pending: []
            };
        }

        await this.sequelize.query(`SELECT pg_advisory_lock(${POSTGRES_MIGRATION_ADVISORY_LOCK_ID})`);

        try {
            await this.sequelize.query(`
                CREATE TABLE IF NOT EXISTS "schema_migrations" (
                    "name" text PRIMARY KEY NOT NULL,
                    "applied_at" text NOT NULL
                );
            `);

            const migrationDir = join(migrationsRoot, "postgresql");
            const files = (await readdir(migrationDir))
                .filter((fileName) => fileName.endsWith(".sql"))
                .sort();

            const applied: string[] = [];
            const pending: string[] = [];

            for (const fileName of files) {
                const migrationName = fileName.replace(/\.sql$/, "");
                const existing = await SchemaMigrationModel.findByPk(migrationName);

                if (existing) {
                    applied.push(migrationName);
                    continue;
                }

                pending.push(migrationName);
                const sql = await readFile(join(migrationDir, fileName), "utf8");
                await this.sequelize.query(sql);
                await SchemaMigrationModel.create({
                    name: migrationName,
                    appliedAt: new Date().toISOString()
                });

                applied.push(migrationName);
                logMigrations.debug("applied name=%s dialect=%s", migrationName, this.dialect);
            }

            return {
                applied,
                pending: []
            };
        } finally {
            await this.sequelize.query(`SELECT pg_advisory_unlock(${POSTGRES_MIGRATION_ADVISORY_LOCK_ID})`);
        }
    }
}
