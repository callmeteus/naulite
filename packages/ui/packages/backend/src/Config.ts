/**
 * Resolved admin API runtime configuration.
 */
export interface AdminApiConfig {
    host: string;
    port: number;
    controlPlaneInstances: string[];
    adminApiKey?: string;
}

/**
 * Parses comma-separated control plane base URLs.
 *
 * Format: http://control-plane-1:8080,http://control-plane-2:8080
 *
 * @param raw Environment variable value
 * @returns Normalized control plane base URLs
 */
export function parseControlPlaneInstances(raw: string | undefined): string[] {
    if (!raw?.trim()) {
        return ["http://localhost:8080"];
    }

    const instances = raw
        .split(",")
        .map((part) => part.trim().replace(/\/$/, ""))
        .filter((part) => part.length > 0);

    return instances.length > 0 ? instances : ["http://localhost:8080"];
}

/**
 * Reads admin API configuration from environment variables.
 *
 * @returns Resolved configuration
 */
export function resolveConfigFromEnv(): AdminApiConfig {
    const host = process.env.HOST ?? "0.0.0.0";
    const port = Number(process.env.PORT ?? 3001);
    const controlPlaneInstances = parseControlPlaneInstances(process.env.CONTROL_PLANE_INSTANCES);
    const adminApiKey = process.env.ADMIN_API_KEY?.trim() || undefined;

    return {
        host,
        port,
        controlPlaneInstances,
        adminApiKey
    };
}
