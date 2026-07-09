import {
    BuildServiceBodySchema,
    BuildWaitQuerySchema,
    LooseObjectSchema,
    RouteErrorResponseSchema
} from "@naulite/shared";
import { ControlPlaneService } from "../ControlPlaneService";
import { PermissionPreHandlers } from "../auth/PermissionPreHandlers";
import { defineRoute } from "../routing/DefineRoute";
import { BuildService, BuildServiceError } from "../services/BuildService";

export const POST = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("runs:write"),
    schema: {
        summary: "Trigger service build",
        description: "Requests a service image build on a node with the builder capability.",
        tags: ["build"],
        operationId: "triggerServiceBuild",
        body: BuildServiceBodySchema,
        querystring: BuildWaitQuerySchema,
        response: {
            200: LooseObjectSchema,
            404: RouteErrorResponseSchema,
            503: RouteErrorResponseSchema
        }
    },

    async handler(req, res) {
        const { serviceName, provider, registry } = req.body;
        const services = await ControlPlaneService.Store.listServices();
        const service = services.find((entry) => entry.name === serviceName);

        if (!service) {
            return res.status(404).send({
                error: "not_found",
                message: `Service ${serviceName} not found.`
            });
        }

        const context = ControlPlaneService.requireContext();
        const nodes = await ControlPlaneService.Store.listNodes();
        const revisions = await ControlPlaneService.GitOps.listRevisions();
        const latestRevision = revisions[0];

        if (!latestRevision?.manifestYaml) {
            return res.status(503).send({
                error: "builder_not_configured",
                message: "No manifest revision is available to resolve the service build."
            });
        }

        const manifest = ControlPlaneService.Orchestration.ComposeParser.parse(latestRevision.manifestYaml);

        try {
            const result = await BuildService.buildService(
                context,
                nodes,
                serviceName,
                manifest,
                { provider, registry, wait: req.query.wait === "true" }
            );

            if (!req.query.wait) {
                res.status(202);
            }

            return {
                serviceName,
                imageRef: result.imageRef,
                logs: result.logs,
                durationMs: result.durationMs,
                runId: result.runId,
                workflowId: result.workflowId
            };
        } catch (err) {
            if (err instanceof BuildServiceError) {
                return res.status(err.statusCode).send({
                    error: err.code,
                    message: err.message
                });
            }

            return res.status(503).send({
                error: "builder_not_configured",
                message: err instanceof Error ? err.message : String(err)
            });
        }
    }
});
