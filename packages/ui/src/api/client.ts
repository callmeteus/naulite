import { PlatformClient } from "@platform/sdk";

const baseUrl = import.meta.env.VITE_PLATFORM_CP_URL ?? "/api";

/**
 * Shared SDK client for the dashboard.
 */
export const platformClient = new PlatformClient({ baseUrl });
