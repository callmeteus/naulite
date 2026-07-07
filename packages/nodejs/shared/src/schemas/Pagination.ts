import { z } from "zod";

/**
 * Standard pagination query parameters for list endpoints.
 */
export const PaginationQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(200).default(50)
});

/**
 * Parsed pagination query parameters.
 */
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

/**
 * Builds a Zod schema for paginated list responses.
 *
 * @param itemSchema Schema for each item in the list
 * @returns Paginated list response schema
 */
export function PaginatedListSchema<T extends z.ZodTypeAny>(itemSchema: T) {
    return z.object({
        items: z.array(itemSchema),
        total: z.number().int().nonnegative(),
        page: z.number().int().positive(),
        limit: z.number().int().positive(),
        hasMore: z.boolean()
    });
}

/**
 * Paginated list response shape.
 */
export type PaginatedList<T> = {
    items: T[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
};

/**
 * Builds a paginated list response from a page slice and total count.
 *
 * @param items Items for the current page
 * @param total Total item count across all pages
 * @param page Current page number
 * @param limit Page size
 * @returns Paginated list response
 */
export function buildPaginatedList<T>(
    items: T[],
    total: number,
    page: number,
    limit: number
): PaginatedList<T> {
    return {
        items,
        total,
        page,
        limit,
        hasMore: page * limit < total
    };
}

/**
 * Returns the SQL offset for a page and limit pair.
 *
 * @param page Current page number
 * @param limit Page size
 * @returns Zero-based offset
 */
export function paginationOffset(page: number, limit: number): number {
    return (page - 1) * limit;
}
