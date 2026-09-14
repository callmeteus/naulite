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
 * Applies versioned SQL migrations for SQLite (dev) and PostgreSQL (production).
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
        const files = await this.listSqlFileNames();

        return files.map((fileName) => fileName.replace(/\.sql$/, ""));
    }

    /**
     * Lists migration names already recorded in schema_migrations.
     *
     * @returns Applied migration names
     */
    async listAppliedMigrationNames(): Promise<string[]> {
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
     * SQLite also runs `sequelize.sync()` so model tables exist, then applies
     * versioned SQL (ALTER COLUMN, new tables) on every boot including yarn dev.
     *
     * @returns Migration result summary
     */
    async run(): Promise<DatabaseMigrationResult> {
        if (this.dialect === "sqlite") {
            await this.sequelize.sync();
            return this.applySqlMigrations();
        }

        await this.sequelize.query(`SELECT pg_advisory_lock(${POSTGRES_MIGRATION_ADVISORY_LOCK_ID})`);

        try {
            await this.sequelize.query(`
                CREATE TABLE IF NOT EXISTS "schema_migrations" (
                    "name" text PRIMARY KEY NOT NULL,
                    "applied_at" text NOT NULL
                );
            `);

            return await this.applySqlMigrations();
        } finally {
            await this.sequelize.query(`SELECT pg_advisory_unlock(${POSTGRES_MIGRATION_ADVISORY_LOCK_ID})`);
        }
    }

    /**
     * Reads sorted SQL file names for the active dialect folder.
     *
     * @returns SQL file names
     */
    private async listSqlFileNames(): Promise<string[]> {
        const migrationDir = join(migrationsRoot, this.dialect);
        const files = await readdir(migrationDir);

        return files.filter((fileName) => fileName.endsWith(".sql")).sort();
    }

    /**
     * Applies each pending SQL file and records it in schema_migrations.
     *
     * @returns Applied names and empty pending list
     */
    private async applySqlMigrations(): Promise<DatabaseMigrationResult> {
        const migrationDir = join(migrationsRoot, this.dialect);
        const files = await this.listSqlFileNames();
        const applied: string[] = [];

        for (const fileName of files) {
            const migrationName = fileName.replace(/\.sql$/, "");
            const existing = await SchemaMigrationModel.findByPk(migrationName);

            if (existing) {
                applied.push(migrationName);
                continue;
            }

            const sql = await readFile(join(migrationDir, fileName), "utf8");
            await this.executeMigrationSql(sql);
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
    }

    /**
     * Executes a migration SQL file.
     *
     * @param sql Migration file contents
     * @returns Nothing.
     */
    private async executeMigrationSql(sql: string): Promise<void> {
        if (this.dialect === "postgresql") {
            await this.sequelize.query(sql);
            return;
        }

        const statements = sql
            .split(";")
            .map((part) => part.trim())
            .filter((statement) => statement.length > 0);

        for (const statement of statements) {
            await this.executeSqliteStatement(statement);
        }
    }

    /**
     * Runs one SQLite statement, skipping duplicate columns and existing tables.
     *
     * @param statement Single SQL statement
     * @returns Nothing.
     */
    private async executeSqliteStatement(statement: string): Promise<void> {
        const addColumn = statement.match(
            /ALTER TABLE\s+[`"]?(\w+)[`"]?\s+ADD COLUMN(?:\s+IF NOT EXISTS)?\s+[`"]?(\w+)[`"]?/i
        );

        if (addColumn) {
            const tableName = addColumn[1];
            const columnName = addColumn[2];

            if (await this.sqliteColumnExists(tableName, columnName)) {
                return;
            }
        }

        try {
            await this.sequelize.query(statement);
        } catch (err) {
            if (this.isIgnorableSqliteSchemaError(err)) {
                return;
            }

            throw err;
        }
    }

    /**
     * Returns whether a SQLite table already has a column.
     *
     * @param tableName Table name
     * @param columnName Column name
     * @returns Whether the column exists
     */
    private async sqliteColumnExists(tableName: string, columnName: string): Promise<boolean> {
        const [rows] = await this.sequelize.query(`PRAGMA table_info(${tableName})`);

        if (!Array.isArray(rows)) {
            return false;
        }

        return rows.some((row) => {
            if (typeof row !== "object" || row === null || !("name" in row)) {
                return false;
            }

            return row.name === columnName;
        });
    }

    /**
     * Returns whether a SQLite error is a duplicate schema object.
     *
     * @param err Caught error
     * @returns Whether the statement can be skipped
     */
    private isIgnorableSqliteSchemaError(err: unknown): boolean {
        const message = err instanceof Error ? err.message : String(err);
        const lower = message.toLowerCase();

        return lower.includes("duplicate column")
            || lower.includes("already exists");
    }
}
