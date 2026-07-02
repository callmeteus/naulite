import type {
    DatabaseConnectionOptions,
    DatabaseDialect,
    DatabaseMigrationResult,
    DatabaseProvider as DatabaseProviderContract
} from "@platform/shared";
import { createClient, type Client } from "@libsql/client";
import { drizzle as drizzleLibsql } from "drizzle-orm/libsql";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { getSchemaForDialect } from "./schema.js";
import { postgresSchema } from "./schema.pg.js";
import { sqliteSchema } from "./schema.sqlite.js";

const moduleDir = dirname(fileURLToPath(import.meta.url));

/**
 * Drizzle database handle for SQLite.
 */
export type SqliteDb = ReturnType<typeof drizzleLibsql<typeof sqliteSchema>>;

/**
 * Drizzle database handle for PostgreSQL.
 */
export type PgDb = ReturnType<typeof drizzlePg<typeof postgresSchema>>;

/**
 * Drizzle database handle for either SQLite or PostgreSQL.
 */
export type ControlPlaneDb = SqliteDb | PgDb;

/**
 * Control plane database provider backed by Drizzle ORM.
 */
export class DatabaseProvider implements DatabaseProviderContract {
    private dialect: DatabaseDialect = "sqlite";
    private sqliteDb: SqliteDb | null = null;
    private pgDb: PgDb | null = null;
    private sqliteClient: Client | null = null;
    private pgPool: Pool | null = null;
    private appliedMigrations: string[] = [];

    /**
     * Returns the active Drizzle database handle.
     * 
     * @returns Connected Drizzle database instance
     */
    getDb(): ControlPlaneDb {
        if (this.sqliteDb) {
            return this.sqliteDb;
        }

        if (this.pgDb) {
            return this.pgDb;
        }

        throw new Error("Database is not connected.");
    }

    /**
     * Returns the SQLite Drizzle handle.
     * 
     * @returns SQLite Drizzle database instance
     */
    getSqliteDb(): SqliteDb {
        if (!this.sqliteDb) {
            throw new Error("SQLite database is not connected.");
        }

        return this.sqliteDb;
    }

    /**
     * Returns the PostgreSQL Drizzle handle.
     * 
     * @returns PostgreSQL Drizzle database instance
     */
    getPgDb(): PgDb {
        if (!this.pgDb) {
            throw new Error("PostgreSQL database is not connected.");
        }

        return this.pgDb;
    }

    /**
     * Returns the active database dialect.
     * 
     * @returns Configured database dialect
     */
    getDialect(): DatabaseDialect {
        return this.dialect;
    }

    /**
     * Opens a connection pool to the configured database.
     * 
     * @param options Database connection options
     * @returns Nothing.
     */
    async connect(options: DatabaseConnectionOptions): Promise<void> {
        this.dialect = options.dialect;

        if (options.dialect === "postgresql") {
            this.pgPool = new Pool({
                connectionString: options.url,
                max: options.maxConnections ?? 10,
                ssl: options.ssl ? { rejectUnauthorized: false } : undefined
            });
            this.pgDb = drizzlePg(this.pgPool, { schema: postgresSchema });
            return;
        }

        const libsqlUrl = DatabaseProvider.toLibsqlUrl(options.url);
        const databasePath = libsqlUrl.replace(/^file:/, "");
        const parentDir = dirname(databasePath);

        if (parentDir && parentDir !== "." && !existsSync(parentDir)) {
            mkdirSync(parentDir, { recursive: true });
        }

        this.sqliteClient = createClient({ url: libsqlUrl });
        this.sqliteDb = drizzleLibsql(this.sqliteClient, { schema: sqliteSchema });
    }

    /**
     * Closes active database connections.
     * 
     * @returns Nothing.
     */
    async disconnect(): Promise<void> {
        if (this.pgPool) {
            await this.pgPool.end();
            this.pgPool = null;
        }

        if (this.sqliteClient) {
            this.sqliteClient.close();
            this.sqliteClient = null;
        }

        this.sqliteDb = null;
        this.pgDb = null;
    }

    /**
     * Applies pending schema migrations.
     * 
     * @returns Migration result summary
     */
    async migrate(): Promise<DatabaseMigrationResult> {
        const migrationsFolder = join(moduleDir, "migrations", this.dialect);
        const migrationFiles = DatabaseProvider.listMigrationFiles(migrationsFolder);
        const pending: string[] = [];

        for (const migrationFile of migrationFiles) {
            if (this.appliedMigrations.includes(migrationFile)) {
                continue;
            }

            const migrationSql = readFileSync(join(migrationsFolder, migrationFile), "utf8");
            const statements = migrationSql
                .split(";")
                .map((statement) => statement.trim())
                .filter((statement) => statement.length > 0);

            for (const statement of statements) {
                if (this.dialect === "postgresql") {
                    await this.getPgDb().execute(sql.raw(statement));
                } else if (this.sqliteClient) {
                    await this.sqliteClient.execute(statement);
                }
            }

            this.appliedMigrations.push(migrationFile);
        }

        return {
            applied: this.appliedMigrations,
            pending
        };
    }

    /**
     * Reports whether the database connection is healthy.
     * 
     * @returns Whether the database is reachable
     */
    async healthCheck(): Promise<boolean> {
        try {
            if (this.dialect === "postgresql") {
                await this.getPgDb().execute(sql`SELECT 1`);
            } else if (this.sqliteClient) {
                await this.sqliteClient.execute("SELECT 1");
            }
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Resolves default connection options from environment variables.
     * 
     * @returns Database connection options
     */
    static resolveOptionsFromEnv(): DatabaseConnectionOptions {
        const databaseUrl = process.env.DATABASE_URL;

        if (databaseUrl?.startsWith("postgres://") || databaseUrl?.startsWith("postgresql://")) {
            return {
                dialect: "postgresql",
                url: databaseUrl,
                ssl: process.env.DATABASE_SSL === "true"
            };
        }

        const sqlitePath = process.env.DATABASE_PATH ?? "./data/control-plane.db";
        const url = sqlitePath.startsWith("sqlite://") ? sqlitePath : `sqlite://${sqlitePath}`;

        return {
            dialect: "sqlite",
            url
        };
    }

    /**
     * Lists SQL migration files present for a dialect folder.
     * 
     * @param migrationsFolder Migration directory path
     * @returns Sorted migration file names
     */
    /**
     * Converts sqlite connection URLs into libsql file URLs.
     * 
     * @param url SQLite or libsql connection URL
     * @returns libsql-compatible file URL
     */
    private static toLibsqlUrl(url: string): string {
        if (url.startsWith("file:")) {
            return url;
        }

        const databasePath = url.replace(/^sqlite:\/\//, "");
        return `file:${databasePath}`;
    }

    /**
     * Lists SQL migration files present for a dialect folder.
     * 
     * @param migrationsFolder Migration directory path
     * @returns Sorted migration file names
     */
    private static listMigrationFiles(migrationsFolder: string): string[] {
        try {
            return readdirSync(migrationsFolder)
                .filter((entry) => entry.endsWith(".sql"))
                .sort();
        } catch {
            return [];
        }
    }
}

/**
 * Returns the schema tables for the active dialect.
 * 
 * @param provider Connected database provider
 * @returns Drizzle schema tables
 */
export function getActiveSchema(provider: DatabaseProvider) {
    return getSchemaForDialect(provider.getDialect());
}
