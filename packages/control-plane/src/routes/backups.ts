import {
    BackupRunSummarySchema,
    PaginatedListSchema,
    PaginationQuerySchema
} from "@naulite/shared";
import { ControlPlaneService } from "../ControlPlaneService";
import { PermissionPreHandlers } from "../auth/PermissionPreHandlers";
import { defineRoute } from "../routing/DefineRoute";

export const GET = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("backups:read"),
    schema: {
        summary: "List backup runs",
        description: "Lists backup runs recorded by the control plane.",
        tags: ["backups"],
        operationId: "listBackupRuns",
        querystring: PaginationQuerySchema,
        response: {
            200: PaginatedListSchema(BackupRunSummarySchema)
        }
    },

    async handler(req) {
        return ControlPlaneService.Store.listBackupRuns(req.query);
    }
});
