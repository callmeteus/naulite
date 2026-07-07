import { z } from "zod";

/**
 * Unified API error payload returned by control plane and BFF routes.
 */
export const ApiErrorResponseSchema = z.object({
    message: z.string(),
    code: z.string().optional(),
    details: z.unknown().optional()
});

export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
