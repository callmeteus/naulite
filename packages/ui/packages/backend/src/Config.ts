/**
 * Resolved admin API runtime configuration.
 */
export interface AdminApiConfig {
    host: string;
    port: number;
    controlPlaneUrl: string;
    leaderInstanceUrls?: Record<string, string>;
    adminApiKey?: string;
}

/**
 * Parses control plane instance ids mapped to base URLs.
 *
 * Format: cp-1=http://control-plane-1:8080,cp-2=http://control-plane-2:8080
 *
 * @param raw Environment variable value
 * @returns Instance id to base URL map
 */
export function parseLeaderInstanceUrls(raw: string | undefined): Record<string, string> | undefined {
    if (!raw?.trim()) {
        return undefined;
    }

    const entries = raw
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
    const map: Record<string, string> = {};

    for (const entry of entries) {
        const separatorIndex = entry.indexOf("=");

        if (separatorIndex <= 0) {
            continue;
        }

        const instanceId = entry.slice(0, separatorIndex).trim();
        const baseUrl = entry.slice(separatorIndex + 1).trim().replace(/\/$/, "");

        if (!instanceId || !baseUrl) {
            continue;
        }

        map[instanceId] = baseUrl;
    }

    return Object.keys(map).length > 0 ? map : undefined;
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
    const leaderInstanceUrls = parseLeaderInstanceUrls(process.env.CONTROL_PLANE_INSTANCES);
    const adminApiKey = process.env.ADMIN_API_KEY?.trim() || undefined;

    return {
        host,
        port,
        controlPlaneUrl,
        leaderInstanceUrls,
        adminApiKey
    };
}
