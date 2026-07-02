/**
 * Resolves and validates self-hosted NetBird configuration.
 */
export namespace NetBirdConfig {
    const CLOUD_HOST_SUFFIX = ".netbird.io";
    const CLOUD_HOSTS = new Set([
        "api.netbird.io",
        "app.netbird.io",
        "netbird.io"
    ]);

    /**
     * Returns whether the hostname belongs to NetBird cloud.
     * 
     * @param hostname Hostname to validate
     * @returns Whether the hostname is a cloud endpoint
     */
    export function isCloudHostname(hostname: string): boolean {
        const normalized = hostname.trim().toLowerCase();

        if (CLOUD_HOSTS.has(normalized)) {
            return true;
        }

        return normalized.endsWith(CLOUD_HOST_SUFFIX);
    }

    /**
     * Ensures the URL targets a self-hosted NetBird instance.
     * 
     * @param url NetBird API or management URL
     * @returns Nothing.
     */
    export function assertSelfHosted(url: string): void {
        let parsed: URL;

        try {
            parsed = new URL(url);
        } catch {
            throw new Error("NETBIRD_API_URL must be a valid self-hosted NetBird URL.");
        }

        if (isCloudHostname(parsed.hostname)) {
            throw new Error(
                `NetBird cloud endpoint "${parsed.hostname}" is not allowed. Use a self-hosted management URL.`
            );
        }
    }

    /**
     * Resolves the self-hosted NetBird API base URL from environment variables.
     * 
     * @returns Normalized API base URL without trailing slash
     */
    export function resolveApiUrl(): string {
        const raw = process.env.NETBIRD_API_URL ?? process.env.NETBIRD_MANAGEMENT_URL;

        if (!raw?.trim()) {
            throw new Error(
                "NETBIRD_API_URL is required. NetBird must be self-hosted - cloud endpoints are not supported."
            );
        }

        const normalized = raw.trim().replace(/\/+$/, "");
        assertSelfHosted(normalized);
        return normalized;
    }

    /**
     * Returns whether the test mock adapter should be used.
     * 
     * @returns Whether PLATFORM_NETBIRD_MOCK is enabled
     */
    export function useMockAdapter(): boolean {
        return process.env.PLATFORM_NETBIRD_MOCK === "1";
    }
}
