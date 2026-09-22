import {
    SandboxInstanceSchema,
    SandboxTemplateSchema,
    UpdateSandboxTemplateBodySchema
} from "@naulite/shared";
import { z } from "zod";

import { LeaderPreHandlers } from "../../auth/LeaderPreHandlers";
import { PermissionPreHandlers } from "../../auth/PermissionPreHandlers";
import { ControlPlaneService } from "../../ControlPlaneService";
import { defineRoute } from "../../routing/DefineRoute";
import { SandboxTemplateService } from "../../services/SandboxTemplateService";

const SandboxParamsSchema = z.object({
    id: z.string().min(1)
});

export const GET = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("nodes:read"),
    schema: {
        summary: "Get sandbox template",
        description: "Returns a sandbox template and live clone rows.",
        tags: ["sandboxes"],
        operationId: "getSandboxTemplate",
        params: SandboxParamsSchema,
        response: {
            200: z.object({
                template: SandboxTemplateSchema,
                instances: z.array(SandboxInstanceSchema)
            })
        }
    },

    async handler(req) {
        const template = await SandboxTemplateService.get(req.params.id);
        const instances = await ControlPlaneService.Store.listSandboxInstances(template.id);

        return {
            template,
            instances
        };
    }
});

export const PATCH = defineRoute({
    preHandler: [
        ...PermissionPreHandlers.authorizedWithPermission("nodes:write"),
        LeaderPreHandlers.requireLeader()
    ],

    schema: {
        summary: "Update sandbox template",
        description: "Updates warm pool size and nightly bake cron expression.",
        tags: ["sandboxes"],
        operationId: "updateSandboxTemplate",
        params: SandboxParamsSchema,
        body: UpdateSandboxTemplateBodySchema,
        response: {
            200: SandboxTemplateSchema
        }
    },

    async handler(req) {
        return SandboxTemplateService.update(req.params.id, req.body);
    }
});
