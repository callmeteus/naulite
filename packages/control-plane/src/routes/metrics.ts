import { PermissionPreHandlers } from "../auth/PermissionPreHandlers";
import { PrometheusMetrics } from "../metrics/PrometheusMetrics";
import { defineRoute } from "../routing/DefineRoute";

export const GET = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("metrics:read"),
    schema: {
        summary: "Prometheus metrics",
        description: "Returns cluster inventory metrics in Prometheus text exposition format.",
        tags: ["observability"],
        operationId: "getPrometheusMetrics",
        response: {
            200: {
                type: "string",
                description: "Prometheus text exposition format"
            }
        }
    },
    async handler(_req, res) {
        const body = await PrometheusMetrics.collectText();
        return res.type("text/plain; version=0.0.4; charset=utf-8").send(body);
    }
});
