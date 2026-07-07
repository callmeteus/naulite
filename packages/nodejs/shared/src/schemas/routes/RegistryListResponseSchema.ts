import { z } from "zod";

/**
 * Registry list response payload.
 */
export const RegistryListResponseSchema = z.object({
    registries: z.array(z.string())
});
