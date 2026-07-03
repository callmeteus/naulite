import { z } from "zod";

/**
 * Plugin categories supported by the platform registry.
 */
export const PluginTypeSchema = z.enum([
    "runtime",
    "builder",
    "gateway",
    "registry",
    "secret",
    "volume",
    "backupDestination",
    "containerRegistryBlob",
    "logRotation",
    "logRotationSink",
    "database",
    "nodeProvisioner",
    "notification"
]);

/**
 * Registered plugin metadata exposed by the control plane.
 */
export const PluginSchema = z.object({
    id: z.string().min(1),
    type: PluginTypeSchema,
    version: z.string().min(1),
    enabled: z.boolean().default(true),
    directoryName: z.string().min(1).optional(),
    description: z.string().optional()
});

/**
 * Base contract implemented by every plugin package.
 */
export const PluginRegistrationSchema = z.object({
    id: z.string().min(1),
    type: PluginTypeSchema,
    version: z.string().min(1)
});
