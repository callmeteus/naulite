import { z } from "zod";

import { BackupRunSummarySchema } from "@platform/shared";
import { ControlPlaneService } from "../ControlPlaneService";
import { AuthPreHandlers } from "../auth/AuthPreHandlers";
import { defineRoute } from "../routing/DefineRoute";

export const GET = defineRoute({
    preHandler: AuthPreHandlers.authorizedLocalOrApiKey,
    schema: {
        summary: "List backup runs",
        description: "Lists backup runs recorded by the control plane.",
        tags: ["backups"],
        operationId: "listBackupRuns",
        response: {
            200: z.array(BackupRunSummarySchema)
        }
    },
    async handler() {
        return ControlPlaneService.Store.listBackupRuns();
    }
});
