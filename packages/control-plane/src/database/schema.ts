export { sqliteSchema, type SqliteSchema } from "./schema.sqlite.js";
export { postgresSchema, type PostgresSchema } from "./schema.pg.js";

import type { DatabaseDialect } from "@platform/shared";

import { postgresSchema } from "./schema.pg.js";
import { sqliteSchema } from "./schema.sqlite.js";

/**
 * Resolves the Drizzle schema for the configured database dialect.
 * 
 * @param dialect Database dialect in use
 * @returns Drizzle schema tables for the dialect
 */
export function getSchemaForDialect(dialect: DatabaseDialect) {
    return dialect === "postgresql" ? postgresSchema : sqliteSchema;
}

export type ControlPlaneSchema = ReturnType<typeof getSchemaForDialect>;
