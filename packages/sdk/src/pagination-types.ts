/**
 * Standard pagination query parameters for list endpoints.
 */
export interface PaginationQuery {
    page?: number;
    limit?: number;
    cursor?: string;
    sort?: string;
}

/**
 * Standard paginated list response envelope.
 */
export interface PaginatedResponse<T> {
    items: T[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
}
