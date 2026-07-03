import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import type { DatabaseDialect, DatabaseMigrationResult } from "@platform/shared";
import type { Sequelize } from "sequelize";

import { SchemaMigrationModel } from "./models/index";

const migrationsRoot = join(dirname(fileURLToPath(import.meta.url)), "migrations");

/** PostgreSQL advisory lock id so HA nodes never apply migrations concurrently. */
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
                console.debug("[migrations] applied name=%s dialect=%s", migrationName, this.dialect);
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
