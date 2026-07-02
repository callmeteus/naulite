import { z } from "zod";

import { SecretReferenceSchema } from "./Common.js";

/**
 * TLS configuration for an ingress route.
 */
export const IngressTlsSchema = z.object({
    enabled: z.boolean().default(true),
    certificateSecret: SecretReferenceSchema.optional(),
    privateKeySecret: SecretReferenceSchema.optional()
});

/**
 * Path routing rule exposed through the gateway.
 */
export const IngressPathSchema = z.object({
    path: z.string().min(1),
    port: z.number().int().positive(),
    protocol: z.enum(["http", "https", "tcp"]).default("http")
});

/**
 * Public or internal ingress exposure for a service.
 */
export const IngressSchema = z.object({
    host: z.string().min(1),
    paths: z.array(IngressPathSchema).min(1),
    tls: IngressTlsSchema.optional(),
    exposure: z.enum(["public", "internal"]).default("public")
});
