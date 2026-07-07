import { z } from "zod";

/**
 * Local setup key response payload.
 */
export const SetupKeyResponseSchema = z.object({
    setupKey: z.string()
});
