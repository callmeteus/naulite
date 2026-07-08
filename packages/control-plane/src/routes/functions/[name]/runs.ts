import { z } from "zod";

import { NameParamsSchema, PaginationQuerySchema } from "@naulite/shared";

import { AuthPreHandlers } from "../../../auth/AuthPreHandlers";
import { defineRoute } from "../../../routing/DefineRoute";
import { ControlPlaneService } from "../../../ControlPlaneService";

const FunctionRunListItemSchema = z.object({
    id: z.string().min(1),
    serviceName: z.string().min(1),
    manifestName: z.string().min(1),
    nodeId: z.string().min(1),
    status: z.string().min(1),
    source: z.string().min(1),
    startedAt: z.string().optional(),
    completedAt: z.string().optional(),
    exitCode: z.number().int().optional()
});

const FunctionRunsListResponseSchema = z.object({
    items: z.array(FunctionRunListItemSchema),
    total: z.number().int(),
    page: z.number().int(),
    limit: z.number().int()
});

export const GET = defineRoute({
    preHandler: AuthPreHandlers.authorizedLocalOrApiKey,
    schema: {
        summary: "List function runs",
        description: "Lists function invocation runs.",
        tags: ["functions"],
        operationId: "listFunctionRuns",
        params: NameParamsSchema,
        querystring: PaginationQuerySchema,
        response: {
            200: FunctionRunsListResponseSchema
        }
    },
    async handler(req) {
        // v1: list all runs (service filter is applied in memory).
        const runs = await ControlPlaneService.Store.listFunctionRuns(req.query);
        const filtered = runs.items.filter((entry: { serviceName: string }) => entry.serviceName === req.params.name);
        return {
            ...runs,
            items: filtered,
            total: filtered.length
        };
    }
});

