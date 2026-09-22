import { z } from "zod";

/**
 * NetBird enrollment details exposed to authenticated operators.
 */
export const NetBirdEnrollmentResponseSchema = z.object({
    setupKey: z.string(),
    cpUrl: z.string(),
    netbirdManagementUrl: z.string(),
    agentInstallScriptUrl: z.string().url()
});
