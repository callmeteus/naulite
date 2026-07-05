import { z } from "zod";

import { PrometheusInstantQuerySchema } from "@naulite/shared";
import { PermissionPreHandlers } from "../../auth/PermissionPreHandlers";
import { PrometheusClient } from "../../metrics/PrometheusClient";
import { defineRoute } from "../../routing/DefineRoute";

const PrometheusQueryResponseSchema = z.record(z.string(), z.unknown());

export const GET = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("metrics:read"),
    schema: {
        summary: "Prometheus instant query",
        description: "Proxies an instant PromQL query to the platform Prometheus server.",
        tags: ["observability"],
        operationId: "queryPrometheusMetrics",
        querystring: PrometheusInstantQuerySchema,
        response: {
            200: PrometheusQueryResponseSchema
        }
    },
    async handler(req) {
        return PrometheusClient.proxyGet("/api/v1/query", {
            query: req.query.query,
            time: req.query.time
        });
    }
});
