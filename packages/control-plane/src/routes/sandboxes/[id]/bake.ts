import { z } from "zod";

import { LeaderPreHandlers } from "../../../auth/LeaderPreHandlers";
import { PermissionPreHandlers } from "../../../auth/PermissionPreHandlers";
import { defineRoute } from "../../../routing/DefineRoute";
import { SandboxTemplateService } from "../../../services/SandboxTemplateService";

const SandboxParamsSchema = z.object({
    id: z.string().min(1)
});

export const POST = defineRoute({
    preHandler: [
        ...PermissionPreHandlers.authorizedWithPermission("nodes:write"),
        LeaderPreHandlers.requireLeader()
    ],

    schema: {
        summary: "Trigger sandbox bake",
        description: "Requests a template refresh on the sandbox host and updates bakedAt.",
        tags: ["sandboxes"],
        operationId: "triggerSandboxBake",
        params: SandboxParamsSchema,
        response: {
            202: z.object({
                status: z.string(),
                templateId: z.string()
            })
        }
    },

    async handler(req, res) {
        const result = await SandboxTemplateService.triggerBake(req.params.id);
        res.status(202);
        return result;
    }
});
