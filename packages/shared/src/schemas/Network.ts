import { z } from "zod";

/**
 * Compose-compatible network definition with platform extensions.
 */
export const NetworkSchema = z.object({
    name: z.string().min(1),
    local: z.boolean().default(false),
    driver: z.string().min(1).default("bridge"),
    netbirdGroupId: z.string().min(1).optional()
});

/**
 * Internal exposure rule for NetBird-only service ports.
 */
export const NetworkExposureSchema = z.object({
    serviceName: z.string().min(1),
    port: z.number().int().positive(),
    protocol: z.enum(["tcp", "udp"]).default("tcp"),
    networkName: z.string().min(1)
});
