import { z } from "zod";

/**
 * Request body for instance exec routes.
 */
export const ExecInstanceBodySchema = z.object({
    command: z.array(z.string().min(1)).min(1),
    stdin: z.boolean().optional(),
    tty: z.boolean().optional()
});
