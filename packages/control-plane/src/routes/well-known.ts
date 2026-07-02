import type { FastifyInstance } from "fastify";

/**
 * Registers well-known discovery routes for CLI auto-configuration.
 * 
 * @param app Fastify application instance
 * @returns Nothing.
 */
export async function registerWellKnownRoutes(app: FastifyInstance): Promise<void> {
    app.get("/.well-known/platform", async () => {
        return {
            name: "platform",
            version: "0.1.0",
            authRequired: true,
            defaultPort: 8080,
            localBypass: true
        };
    });
}
