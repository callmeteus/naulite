/**
 * Resolved admin API runtime configuration.
 */
export interface AdminApiConfig {
    host: string;
    port: number;
    controlPlaneUrl: string;
    adminApiKey?: string;
}

/**
 * Reads admin API configuration from environment variables.
 *
 * @returns Resolved configuration
 */
export function resolveConfigFromEnv(): AdminApiConfig {
    const host = process.env.HOST ?? "0.0.0.0";
    const port = Number(process.env.PORT ?? 3001);
    const controlPlaneUrl = process.env.CONTROL_PLANE_URL ?? "http://localhost:8080";
    const adminApiKey = process.env.ADMIN_API_KEY?.trim() || undefined;

    return {
        host,
        port,
        controlPlaneUrl,
        adminApiKey
    };
}
