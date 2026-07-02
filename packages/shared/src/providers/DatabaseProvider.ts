/**
 * Supported database dialects for the control plane.
 */
export type DatabaseDialect = "sqlite" | "postgresql";

/**
 * Connection options for the control plane database.
 */
export interface DatabaseConnectionOptions {
    dialect: DatabaseDialect;
    url: string;
    maxConnections?: number;
    ssl?: boolean;
}

/**
 * Migration execution result.
 */
export interface DatabaseMigrationResult {
    applied: string[];
    pending: string[];
}

/**
 * Database provider contract abstracting SQLite and PostgreSQL via Drizzle.
 */
export interface DatabaseProvider {
    /**
     * Opens a connection pool to the configured database.
     * 
     * @param options Database connection options
     * @returns Nothing.
     */
    connect(options: DatabaseConnectionOptions): Promise<void>;

    /**
     * Closes active database connections.
     * 
     * @returns Nothing.
     */
    disconnect(): Promise<void>;

    /**
     * Applies pending schema migrations.
     * 
     * @returns Migration result summary
     */
    migrate(): Promise<DatabaseMigrationResult>;

    /**
     * Reports whether the database connection is healthy.
     * 
     * @returns Whether the database is reachable
     */
    healthCheck(): Promise<boolean>;
}
