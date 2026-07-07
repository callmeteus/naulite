import { z } from "zod";

/**
 * Agent bootstrap response payload.
 */
export const AgentBootstrapResponseSchema = z.object({
    cpUrl: z.string(),
    netbirdManagementUrl: z.string()
});
