import { z } from "zod";

/**
 * Query parameters for instant PromQL requests.
 */
export const PrometheusInstantQuerySchema = z.object({
    query: z.string().min(1),
    time: z.string().optional()
});

/**
 * Query parameters for range PromQL requests.
 */
export const PrometheusRangeQuerySchema = z.object({
    query: z.string().min(1),
    start: z.string().min(1),
    end: z.string().min(1),
    step: z.string().min(1)
});

/**
 * Query parameters for Prometheus label discovery.
 */
export const PrometheusLabelsQuerySchema = z.object({
    start: z.string().optional(),
    end: z.string().optional(),
    "match[]": z.union([z.string(), z.array(z.string())]).optional()
});

/**
 * Query parameters for Prometheus label value discovery.
 */
export const PrometheusLabelValuesQuerySchema = z.object({
    start: z.string().optional(),
    end: z.string().optional(),
    "match[]": z.union([z.string(), z.array(z.string())]).optional()
});
