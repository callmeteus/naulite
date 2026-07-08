import { z } from "zod";

/**
 * Credentials material source for git-based extends/imports.
 *
 * NOTE: This is intentionally NOT SecretReferenceSchema, because this is not a
 * runtime secret reference inside a manifest. It's a resolver directive.
 */
export const GitCredentialsSchema = z.discriminatedUnion("from", [
    z.object({
        from: z.literal("secret"),
        secret: z.string().min(1),
        key: z.string().min(1).optional(),
        kind: z.enum(["ssh", "https"]).optional()
    })
]);

export type GitCredentials = z.infer<typeof GitCredentialsSchema>;

/**
 * Root-level extends - extends an entire compose file.
 * This is a platform extension (not part of the Compose spec).
 */
export const RootExtendsEntrySchema = z.object({
    file: z.string().min(1),
    credentials: GitCredentialsSchema.optional()
});

export type RootExtendsEntry = z.infer<typeof RootExtendsEntrySchema>;

export const RootExtendsSchema = z.union([RootExtendsEntrySchema, z.array(RootExtendsEntrySchema).min(1)]);
export type RootExtends = z.infer<typeof RootExtendsSchema>;

/**
 * Service-level extends - Compose spec `extends` with a git-aware file source.
 */
export const ServiceExtendsSchema = z.object({
    file: z.string().min(1),
    service: z.string().min(1),
    credentials: GitCredentialsSchema.optional()
});

export type ServiceExtends = z.infer<typeof ServiceExtendsSchema>;

/**
 * Root-level vars used for interpolation.
 * This is a platform extension (not part of the Compose spec).
 */
export const ManifestVarsSchema = z.record(z.string().min(1), z.string()).default({});
export type ManifestVars = z.infer<typeof ManifestVarsSchema>;

/**
 * App-of-apps: catalog of child manifests.
 */
export const AppEntrySchema = z.object({
    path: z.string().min(1)
});

export type AppEntry = z.infer<typeof AppEntrySchema>;

export const AppsCatalogSchema = z.record(z.string().min(1), AppEntrySchema).default({});
export type AppsCatalog = z.infer<typeof AppsCatalogSchema>;

