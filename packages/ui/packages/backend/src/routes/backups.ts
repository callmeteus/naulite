import type { FastifyInstance } from "fastify";
import { z } from "zod";

/**
 * Registers backup action routes for the admin panel.
 *
 * @param app Fastify application instance
 * @returns Nothing.
 */
export async function registerBackupRoutes(app: FastifyInstance): Promise<void> {
    app.post("/backups/:volumeName/run", async (request) => {
        const params = z.object({
            volumeName: z.string().min(1)
        }).parse(request.params);
        return app.controlPlane.runBackup(params.volumeName);
    });

    app.post("/backups/:backupId/restore", async (request) => {
        const params = z.object({
            backupId: z.string().min(1)
        }).parse(request.params);
        return app.controlPlane.restoreBackup(params.backupId);
    });
}
