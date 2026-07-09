import { z } from "zod";

import { PrometheusLabelsQuerySchema } from "@naulite/shared";
import { PermissionPreHandlers } from "../../auth/PermissionPreHandlers";
import { PrometheusClient } from "../../metrics/PrometheusClient";
import { defineRoute } from "../../routing/DefineRoute";

const PrometheusQueryResponseSchema = z.record(z.string(), z.unknown());

export const GET = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("metrics:read"),
    schema: {
        summary: "Prometheus label names",
        description: "Proxies Prometheus label discovery to the platform Prometheus server.",
        tags: ["observability"],
        operationId: "listPrometheusMetricLabels",
        querystring: PrometheusLabelsQuerySchema,
        response: {
            200: PrometheusQueryResponseSchema
        }
    },

    async handler(req) {
        return PrometheusClient.proxyGet("/api/v1/labels", {
            start: req.query.start,
            end: req.query.end,
            "match[]": req.query["match[]"]
        });
    }
});
