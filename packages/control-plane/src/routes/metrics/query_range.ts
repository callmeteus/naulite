import { z } from "zod";

import { PrometheusRangeQuerySchema } from "@naulite/shared";
import { PermissionPreHandlers } from "../../auth/PermissionPreHandlers";
import { PrometheusClient } from "../../metrics/PrometheusClient";
import { defineRoute } from "../../routing/DefineRoute";

const PrometheusQueryResponseSchema = z.record(z.string(), z.unknown());

export const GET = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("metrics:read"),
    schema: {
        summary: "Prometheus range query",
        description: "Proxies a range PromQL query to the platform Prometheus server.",
        tags: ["observability"],
        operationId: "queryPrometheusMetricsRange",
        querystring: PrometheusRangeQuerySchema,
        response: {
            200: PrometheusQueryResponseSchema
        }
    },
    async handler(req) {
        return PrometheusClient.proxyGet("/api/v1/query_range", {
            query: req.query.query,
            start: req.query.start,
            end: req.query.end,
            step: req.query.step
        });
    }
});
