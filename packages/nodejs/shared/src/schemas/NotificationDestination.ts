import { z } from "zod";

import { PipelineEventKindSchema } from "./PipelineRun";

export const NotificationDestinationTypeSchema = z.enum(["SLACK", "WEBHOOK"]);

export const NotificationDestinationSchema = z.object({
    id: z.string(),
    name: z.string(),
    type: NotificationDestinationTypeSchema,
    url: z.string().url(),
    secretConfigured: z.boolean(),
    enabled: z.boolean(),
    allowedKinds: z.array(PipelineEventKindSchema),
    createdAt: z.string(),
    updatedAt: z.string()
});

export const CreateNotificationDestinationBodySchema = z.object({
    name: z.string().trim().min(1),
    type: NotificationDestinationTypeSchema,
    url: z.string().url(),
    secret: z.string().optional(),
    enabled: z.boolean().optional(),
    allowedKinds: z.array(PipelineEventKindSchema).optional()
});

export const UpdateNotificationDestinationBodySchema = z.object({
    name: z.string().trim().min(1).optional(),
    type: NotificationDestinationTypeSchema.optional(),
    url: z.string().url().optional(),
    secret: z.string().optional(),
    enabled: z.boolean().optional(),
    allowedKinds: z.array(PipelineEventKindSchema).optional()
});

export const NotificationDestinationsResponseSchema = z.object({
    destinations: z.array(NotificationDestinationSchema)
});

export const NotificationDestinationTestResultSchema = z.object({
    id: z.string(),
    ok: z.boolean(),
    error: z.string().optional()
});

export const NotificationDestinationTestResponseSchema = z.object({
    destinations: z.array(NotificationDestinationTestResultSchema)
});
