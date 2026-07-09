import { IdParamsSchema, RouteMessageResponseSchema } from "@naulite/shared";
import { PermissionPreHandlers } from "../../../auth/PermissionPreHandlers";
import { defineRoute } from "../../../routing/DefineRoute";
import { PipelineRunService } from "../../../services/PipelineRunService";

export const GET = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("runs:read"),
    schema: {
        summary: "Stream pipeline run events",
        description: "Streams pipeline run events over Server-Sent Events.",
        tags: ["runs"],
        operationId: "streamPipelineRunEvents",
        params: IdParamsSchema,
        response: {
            404: RouteMessageResponseSchema
        }
    },

    async handler(req, res) {
        const run = await PipelineRunService.getRun(req.params.id);

        if (!run) {
            return res.status(404).send({ message: "Pipeline run not found." });
        }

        res.raw.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive"
        });

        let lastEventId = run.events?.at(-1)?.id ?? 0;

        const sendEvents = async () => {
            const events = await PipelineRunService.listEvents(req.params.id, lastEventId);

            for (const event of events) {
                lastEventId = event.id;
                res.raw.write(`id: ${event.id}\n`);
                res.raw.write(`data: ${JSON.stringify(event)}\n\n`);
            }
        };

        await sendEvents();

        const interval = setInterval(() => {
            void sendEvents().catch(() => undefined);
        }, 2000);

        req.raw.on("close", () => {
            clearInterval(interval);
        });
    }
});
