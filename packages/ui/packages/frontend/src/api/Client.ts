import { PlatformClient } from "@platform/sdk";

const baseUrl = import.meta.env.VITE_ADMIN_API_URL ?? "/api";

/**
 * Shared SDK client for the admin API (BFF), not the control plane directly.
 */
export const platformClient = new PlatformClient({ baseUrl });
