import type { FastifyInstance } from "fastify";

/**
 * Registers NetBird proxy routes for the admin panel.
 *
 * @param app Fastify application instance
 * @returns Nothing.
 */
export async function registerNetBirdRoutes(app: FastifyInstance): Promise<void> {
    app.get("/netbird/topology", async () => {
        return app.controlPlane.getNetBirdTopology();
    });

    app.get("/netbird/devices", async () => {
        const devices = await app.controlPlane.listNetBirdDevices();
        return { devices };
    });

    app.get("/netbird/groups", async () => {
        const groups = await app.controlPlane.listNetBirdGroups();
        return { groups };
    });

    app.get("/netbird/acls", async () => {
        const acls = await app.controlPlane.listNetBirdAcls();
        return { acls };
    });

    app.get("/netbird/enrollment", async () => {
        return app.controlPlane.getNetBirdEnrollment();
    });
}
