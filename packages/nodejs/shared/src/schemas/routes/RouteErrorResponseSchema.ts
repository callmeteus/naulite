import { z } from "zod";

/**
 * Standard route error payload with code and message.
 */
export const RouteErrorResponseSchema = z.object({
    error: z.string(),
    message: z.string()
});
