import { z } from "zod";

/**
 * Simple message-only route error payload.
 */
export const RouteMessageResponseSchema = z.object({
    message: z.string()
});
