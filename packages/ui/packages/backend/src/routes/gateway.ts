import type { FastifyInstance } from "fastify";

/**
 * Registers gateway routes backed by the control plane API.
 *
 * @param app Fastify application instance
 * @returns Nothing.
 */
export async function registerGatewayRoutes(app: FastifyInstance): Promise<void> {
    app.get("/gateway/routes", async () => {
        return app.controlPlane.listGatewayRoutes();
    });
}
