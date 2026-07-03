/**
 * Single sample in a Prometheus instant query vector result.
 */
export interface PromQLSample {
    metric: Record<string, string>;
    value: [number, string];
}

/**
 * Time series in a Prometheus range query matrix result.
 */
export interface PromQLSeries {
    metric: Record<string, string>;
    values: Array<[number, string]>;
}

/**
 * Successful instant PromQL query response.
 */
export interface PromQLInstantResponse {
    status: "success" | "error";
    data?: {
        resultType: "vector";
        result: PromQLSample[];
    };
    error?: string;
    errorType?: string;
}

/**
 * Successful range PromQL query response.
 */
export interface PromQLRangeResponse {
    status: "success" | "error";
    data?: {
        resultType: "matrix";
        result: PromQLSeries[];
    };
    error?: string;
    errorType?: string;
}
