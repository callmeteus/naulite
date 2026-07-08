import { z } from "zod";

import { NameParamsSchema } from "@naulite/shared";

import { AuthPreHandlers } from "../../../auth/AuthPreHandlers";
import { LeaderPreHandlers } from "../../../auth/LeaderPreHandlers";
import { PermissionPreHandlers } from "../../../auth/PermissionPreHandlers";
import { defineRoute } from "../../../routing/DefineRoute";
import { FunctionInvokeService } from "../../../services/FunctionInvokeService";

const InvokeFunctionBodySchema = z.object({
    payload: z.unknown().optional(),
    environment: z.record(z.string(), z.string()).optional()
});

const InvokeFunctionResponseSchema = z.object({
    runId: z.string().min(1)
});

export const POST = defineRoute({
    preHandler: [
        AuthPreHandlers.authorizedLocalOrApiKey,
        LeaderPreHandlers.requireLeader(),
        PermissionPreHandlers.requirePermission("workloads:write")
    ],
    schema: {
        summary: "Invoke function service",
        description: "Invokes a function-mode service and returns the run id.",
        tags: ["functions"],
        operationId: "invokeFunction",
        params: NameParamsSchema,
        body: InvokeFunctionBodySchema,
        response: {
            200: InvokeFunctionResponseSchema
        }
    },
    async handler(req) {
        const { name } = req.params;
        return FunctionInvokeService.invoke(name, {
            source: "api",
            payload: req.body.payload,
            environment: req.body.environment
        });
    }
});

