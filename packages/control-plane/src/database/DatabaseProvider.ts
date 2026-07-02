import type {
    DatabaseConnectionOptions,
    DatabaseDialect,
    DatabaseMigrationResult,
    DatabaseProvider as DatabaseProviderContract
} from "@platform/shared";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Sequelize } from "sequelize-typescript";

import { controlPlaneModels, SchemaMigrationModel } from "./models/index.js";

/**
 * Control plane database provider backed by Sequelize ORM.
 */
export class DatabaseProvider implements DatabaseProviderContract {
    private dialect: DatabaseDialect = "sqlite";
    private sequelize: Sequelize | null = null;

    /**
     * Returns the active Sequelize instance.
     *
     * @returns Connected Sequelize instance
     */
    getSequelize(): Sequelize {
        if (!this.sequelize) {
            throw new Error("Database is not connected.");
        }

        return this.sequelize;
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
            this.sequelize = new Sequelize(options.url, {
                dialect: "postgres",
                models: controlPlaneModels,
                logging: false,
                pool: {
                    max: options.maxConnections ?? 10
                },
                dialectOptions: options.ssl
                    ? { ssl: { rejectUnauthorized: false } }
                    : undefined
            });
            await this.sequelize.authenticate();
            return;
        }

        const storage = DatabaseProvider.resolveSqliteStoragePath(options.url);
        const parentDir = dirname(storage);

        if (parentDir && parentDir !== "." && !existsSync(parentDir)) {
            mkdirSync(parentDir, { recursive: true });
        }

        this.sequelize = new Sequelize({
            dialect: "sqlite",
            storage,
            models: controlPlaneModels,
            logging: false
        });
        await this.sequelize.authenticate();
    }

    /**
     * Closes active database connections.
     *
     * @returns Nothing.
     */
    async disconnect(): Promise<void> {
        if (this.sequelize) {
            await this.sequelize.close();
            this.sequelize = null;
        }
    }

    /**
     * Synchronizes Sequelize models with the database schema.
     *
     * @returns Migration result summary
     */
    async migrate(): Promise<DatabaseMigrationResult> {
        const sequelize = this.getSequelize();
        const migrationName = "001-initial-schema";
        const existing = await SchemaMigrationModel.findByPk(migrationName);

        if (!existing) {
            await sequelize.sync();
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

    /**
     * Reports whether the database connection is healthy.
     *
     * @returns Whether the database is reachable
     */
    async healthCheck(): Promise<boolean> {
        try {
            await this.getSequelize().authenticate();
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
     * Converts sqlite connection URLs into filesystem storage paths.
     *
     * @param url SQLite connection URL
     * @returns Filesystem path for sqlite storage
     */
    private static resolveSqliteStoragePath(url: string): string {
        if (url.startsWith("file:")) {
            return url.replace(/^file:/, "");
        }

        return url.replace(/^sqlite:\/\//, "");
    }
}
