import {
    CreateSandboxTemplateBodySchema,
    PaginatedListSchema,
    SandboxTemplateListQuerySchema,
    SandboxTemplateSchema
} from "@naulite/shared";

import { LeaderPreHandlers } from "../auth/LeaderPreHandlers";
import { PermissionPreHandlers } from "../auth/PermissionPreHandlers";
import { defineRoute } from "../routing/DefineRoute";
import { SandboxTemplateService } from "../services/SandboxTemplateService";

export const GET = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("nodes:read"),
    schema: {
        summary: "List sandbox templates",
        description: "Lists Incus sandbox templates registered on sandbox-capable nodes.",
        tags: ["sandboxes"],
        operationId: "listSandboxTemplates",
        querystring: SandboxTemplateListQuerySchema,
        response: {
            200: PaginatedListSchema(SandboxTemplateSchema)
        }
    },

    async handler(req) {
        return SandboxTemplateService.list(SandboxTemplateListQuerySchema.parse(req.query));
    }
});

export const POST = defineRoute({
    preHandler: [
        ...PermissionPreHandlers.authorizedWithPermission("nodes:write"),
        LeaderPreHandlers.requireLeader()
    ],

    schema: {
        summary: "Register sandbox template",
        description: "Registers an Incus parent template after bake on a sandbox-capable node.",
        tags: ["sandboxes"],
        operationId: "createSandboxTemplate",
        body: CreateSandboxTemplateBodySchema,
        response: {
            201: SandboxTemplateSchema
        }
    },

    async handler(req, res) {
        const created = await SandboxTemplateService.create(req.body);
        res.status(201);
        return created;
    }
});
