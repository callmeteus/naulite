import { z } from "zod";

/**
 * Git checkout performed inside a sandbox clone before the build command.
 */
export const TaskSandboxCheckoutSchema = z.object({
    root: z.string().min(1),
    branch: z.string().min(1).optional(),
    extraRepos: z.array(z.string().min(1)).optional()
});

/**
 * Incus sandbox settings on a build task.
 */
export const TaskSandboxSchema = z.object({
    parent: z.string().min(1),
    workdir: z.string().min(1).optional(),
    checkout: TaskSandboxCheckoutSchema.optional()
});

export type TaskSandboxCheckout = z.infer<typeof TaskSandboxCheckoutSchema>;
export type TaskSandbox = z.infer<typeof TaskSandboxSchema>;
