import { z } from "zod";

import { PaginationQuerySchema } from "./Pagination";

/**
 * Sandbox clone kind (job vs warm pool).
 */
export const SandboxInstanceKindSchema = z.enum(["job", "warm"]);

/**
 * Lifecycle status of a sandbox clone.
 */
export const SandboxInstanceStatusSchema = z.enum([
    "cloning",
    "idle",
    "running",
    "collecting",
    "destroyed",
    "failed"
]);

/**
 * Registered Incus parent environment (baked template).
 */
export const SandboxTemplateSchema = z.object({
    id: z.string().min(1),
    nodeId: z.string().min(1),
    incusName: z.string().min(1),
    snapshot: z.string().min(1).default("base"),
    modulesVolume: z.string().min(1).nullable().optional(),
    warmPoolSize: z.number().int().nonnegative().default(0),
    bakeCron: z.string().nullable().optional(),
    bakedAt: z.string().nullable().optional(),
    sizeBytes: z.number().int().nonnegative().nullable().optional(),
    createdAt: z.string(),
    updatedAt: z.string()
});

/**
 * Ephemeral Incus clone tracked by the control plane.
 */
export const SandboxInstanceSchema = z.object({
    id: z.string().min(1),
    parentId: z.string().min(1),
    runId: z.string().nullable().optional(),
    incusName: z.string().min(1),
    kind: SandboxInstanceKindSchema,
    status: SandboxInstanceStatusSchema,
    createdAt: z.string(),
    destroyedAt: z.string().nullable().optional()
});

export const UpdateSandboxTemplateBodySchema = z.object({
    warmPoolSize: z.number().int().nonnegative().optional(),
    bakeCron: z.string().nullable().optional()
});

export const CreateSandboxTemplateBodySchema = z.object({
    id: z.string().min(1),
    nodeId: z.string().min(1),
    incusName: z.string().min(1),
    snapshot: z.string().min(1).default("base"),
    modulesVolume: z.string().min(1).nullable().optional(),
    warmPoolSize: z.number().int().nonnegative().default(0),
    bakeCron: z.string().nullable().optional(),
    bakedAt: z.string().nullable().optional(),
    sizeBytes: z.number().int().nonnegative().nullable().optional()
});

export const SandboxTemplateListQuerySchema = PaginationQuerySchema;

export type SandboxTemplate = z.infer<typeof SandboxTemplateSchema>;
export type SandboxInstance = z.infer<typeof SandboxInstanceSchema>;
export type SandboxInstanceKind = z.infer<typeof SandboxInstanceKindSchema>;
export type SandboxInstanceStatus = z.infer<typeof SandboxInstanceStatusSchema>;
export type UpdateSandboxTemplateBody = z.infer<typeof UpdateSandboxTemplateBodySchema>;
export type CreateSandboxTemplateBody = z.infer<typeof CreateSandboxTemplateBodySchema>;
