import { z } from "zod";

import { AuthPreHandlers } from "../../../../auth/AuthPreHandlers";
import { defineRoute } from "../../../../routing/DefineRoute";
import { ControlPlaneService } from "../../../../ControlPlaneService";
import { HTTP404Error } from "../../../../errors/TreatedError";

const FunctionRunParamsSchema = z.object({
    name: z.string().min(1),
    id: z.string().min(1)
});

const FunctionRunResponseSchema = z.object({
    id: z.string().min(1),
    serviceId: z.string().min(1),
    serviceName: z.string().min(1),
    manifestName: z.string().min(1),
    nodeId: z.string().min(1),
    status: z.string().min(1),
    source: z.string().min(1),
    exitCode: z.number().int().optional(),
    logs: z.string().optional(),
    payload: z.record(z.string(), z.unknown()),
    startedAt: z.string().optional(),
    completedAt: z.string().optional(),
    durationMs: z.number().int().optional(),
    errorMessage: z.string().optional(),
    createdAt: z.string().min(1)
});

export const GET = defineRoute({
    preHandler: AuthPreHandlers.authorizedLocalOrApiKey,
    schema: {
        summary: "Get function run",
        description: "Returns the full function run record.",
        tags: ["functions"],
        operationId: "getFunctionRun",
        params: FunctionRunParamsSchema,
        response: {
            200: FunctionRunResponseSchema
        }
    },
    async handler(req) {
        const run = await ControlPlaneService.Store.getFunctionRun(req.params.id);
        if (!run || run.serviceName !== req.params.name) {
            throw new HTTP404Error(`Function run ${req.params.id} not found.`, {
                error: "not_found"
            });
        }
        return run;
    }
});

