import type { FastifyInstance } from "fastify";
import { z } from "zod";

/**
 * Registers NetBird proxy stub routes.
 * 
 * @param app Fastify application instance
 * @returns Nothing.
 */
export async function registerNetBirdRoutes(app: FastifyInstance): Promise<void> {
    app.get("/netbird/groups", async () => {
        return {
            groups: await app.controlPlane.netBirdService.listGroups()
        };
    });

    app.get("/netbird/devices", async () => {
        return {
            devices: await app.controlPlane.netBirdService.listDevices()
        };
    });

    app.get("/netbird/acls", async () => {
        return {
            acls: await app.controlPlane.netBirdService.listAcls()
        };
    });

    app.get("/netbird/topology", async () => {
        return await app.controlPlane.netBirdService.getTopology();
    });

    app.post("/netbird/groups", async (request) => {
        const body = z.object({
            name: z.string().min(1)
        }).parse(request.body);

        return {
            group: await app.controlPlane.netBirdService.ensureInternalGroup(body.name)
        };
    });
}
