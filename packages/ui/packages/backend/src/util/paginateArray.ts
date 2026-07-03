/**
 * Paginates an in-memory array when the upstream API still returns a plain list.
 *
 * @param items Full item list
 * @param page One-based page index
 * @param limit Page size
 * @returns Paginated response envelope
 */
export function paginateArray<T>(
    items: T[],
    page = 1,
    limit = 20
): { items: T[]; total: number; page: number; limit: number; hasMore: boolean } {
    const safePage = page > 0 ? page : 1;
    const start = (safePage - 1) * limit;
    const slice = items.slice(start, start + limit);

    return {
        items: slice,
        total: items.length,
        page: safePage,
        limit,
        hasMore: start + limit < items.length
    };
}

/**
 * Parses pagination query parameters from a request query object.
 *
 * @param query Raw request query
 * @returns Normalized pagination parameters
 */
export function parsePaginationQuery(query: Record<string, unknown>): { page: number; limit: number } {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 20);

    return {
        page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
        limit: Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 200) : 20
    };
}
