import { createApp } from "./App";
import { resolveConfigFromEnv } from "./Config";

/**
 * Running admin API server handle.
 */
export interface AdminApiServer {
    host: string;
    port: number;
    stop: () => Promise<void>;
}

/**
 * Boots the admin API HTTP server.
 *
 * @returns Running server handle
 */
export async function startServer(): Promise<AdminApiServer> {
    const config = resolveConfigFromEnv();
    const app = await createApp();

    await app.listen({
        host: config.host,
        port: config.port
    });

    return {
        host: config.host,
        port: config.port,
        stop: async () => {
            await app.close();
        }
    };
}

/**
 * Starts the server when executed as the package entrypoint.
 *
 * @returns Nothing.
 */
async function main(): Promise<void> {
    const server = await startServer();
    console.log(`Admin API listening on http://${server.host}:${server.port}`);
}

main().catch((err) => {
    console.error("Admin API failed to start:", err);
    process.exit(1);
});
