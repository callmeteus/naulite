import { fileURLToPath } from "node:url";

import { createApp } from "./App";
import { resolveConfigFromEnv } from "./Config";
import { Logger } from "./Logger";

const log = Logger.create("server");

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
    log.info("Admin API listening on http://%s:%d", server.host, server.port);
}

const isMainModule = process.argv[1] !== undefined
    && fileURLToPath(import.meta.url) === process.argv[1];

if (isMainModule) {
    main().catch((err) => {
        log.error("Admin API failed to start: %O", err);
        process.exit(1);
    });
}
