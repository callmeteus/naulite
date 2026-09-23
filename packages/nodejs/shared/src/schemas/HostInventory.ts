import { z } from "zod";

import { TimestampSchema } from "./Common";
import { PaginationQuerySchema } from "./Pagination";

/**
 * Supported Linux package manager identifiers.
 */
export const HostPackageManagerSchema = z.enum([
    "apt",
    "dnf",
    "yum",
    "pacman",
    "zypper"
]);

/**
 * Package update status on a host node.
 */
export const HostPackageStatusSchema = z.enum([
    "upToDate",
    "outdated"
]);

/**
 * Single installed package entry on a host node.
 */
export const HostPackageSchema = z.object({
    name: z.string().min(1),
    installedVersion: z.string().min(1),
    availableVersion: z.string().min(1).optional(),
    status: HostPackageStatusSchema
});

/**
 * Summary counts for a host inventory snapshot.
 */
export const HostInventorySummarySchema = z.object({
    total: z.number().int().nonnegative(),
    outdated: z.number().int().nonnegative()
});

/**
 * Persisted host package inventory snapshot for a node.
 */
export const HostInventorySchema = z.object({
    nodeId: z.string().min(1),
    packageManager: HostPackageManagerSchema,
    packages: z.array(HostPackageSchema),
    summary: HostInventorySummarySchema,
    collectedAt: TimestampSchema
});

/**
 * Request body for updating selected host packages.
 */
export const HostUpdateRequestSchema = z.object({
    packages: z.array(z.string().min(1)).optional()
});

/**
 * Kind of host update run.
 */
export const HostUpdateKindSchema = z.enum([
    "packages",
    "system"
]);

/**
 * Status of a host update run.
 */
export const HostUpdateRunStatusSchema = z.enum([
    "pending",
    "running",
    "succeeded",
    "failed"
]);

/**
 * Historical host update run dispatched to an agent.
 */
export const HostUpdateRunSchema = z.object({
    id: z.string().min(1),
    nodeId: z.string().min(1),
    kind: HostUpdateKindSchema,
    status: HostUpdateRunStatusSchema,
    packages: z.array(z.string().min(1)).default([]),
    rebootRequired: z.boolean().default(false),
    stdout: z.string().optional(),
    stderr: z.string().optional(),
    errorMessage: z.string().optional(),
    startedAt: TimestampSchema.optional(),
    completedAt: TimestampSchema.optional(),
    createdAt: TimestampSchema
});

/**
 * Status filter for a page of host packages.
 */
export const HostInventoryStatusFilterSchema = z.enum([
    "all",
    "outdated",
    "upToDate"
]);

/**
 * Query for one page of a node's installed packages.
 */
export const HostPackageListQuerySchema = PaginationQuerySchema.extend({
    refresh: z.enum(["true", "false"]).optional(),
    status: HostInventoryStatusFilterSchema.default("all")
});

/**
 * One page of host packages plus the snapshot summary.
 *
 * `summary` counts the full inventory. `total` counts the rows after `status`.
 */
export const HostInventoryPageSchema = z.object({
    nodeId: z.string().min(1),
    packageManager: HostPackageManagerSchema,
    summary: HostInventorySummarySchema,
    collectedAt: TimestampSchema,
    status: HostInventoryStatusFilterSchema,
    items: z.array(HostPackageSchema),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    hasMore: z.boolean()
});
