import { z } from "zod";

import { PrometheusLabelValuesQuerySchema } from "@platform/shared";
import { AuthPreHandlers } from "../../../../auth/AuthPreHandlers";
import { PrometheusClient } from "../../../../metrics/PrometheusClient";
import { defineRoute } from "../../../../routing/DefineRoute";

const LabelNameParamsSchema = z.object({
    name: z.string().min(1)
});

const PrometheusQueryResponseSchema = z.record(z.string(), z.unknown());

export const GET = defineRoute({
    preHandler: AuthPreHandlers.authorizedLocalOrApiKey,
    schema: {
        summary: "Prometheus label values",
        description: "Proxies Prometheus label value discovery to the platform Prometheus server.",
        tags: ["observability"],
        operationId: "listPrometheusMetricLabelValues",
        params: LabelNameParamsSchema,
        querystring: PrometheusLabelValuesQuerySchema,
        response: {
            200: PrometheusQueryResponseSchema
        }
    },
    async handler(req) {
        return PrometheusClient.proxyGet(`/api/v1/label/${encodeURIComponent(req.params.name)}/values`, {
            start: req.query.start,
            end: req.query.end,
            "match[]": req.query["match[]"]
        });
    }
});
