import { z } from "zod";

import { PrometheusInstantQuerySchema } from "@platform/shared";
import { AuthPreHandlers } from "../../auth/AuthPreHandlers";
import { PrometheusClient } from "../../metrics/PrometheusClient";
import { defineRoute } from "../../routing/DefineRoute";

const PrometheusQueryResponseSchema = z.record(z.string(), z.unknown());

export const GET = defineRoute({
    preHandler: AuthPreHandlers.authorizedLocalOrApiKey,
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
