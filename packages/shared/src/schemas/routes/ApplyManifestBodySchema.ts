import { z } from "zod";

/**
 * Request body for apply manifest routes.
 */
export const ApplyManifestBodySchema = z.object({
    manifestYaml: z.string().min(1).optional(),
    manifest: z.string().min(1).optional()
}).refine((body) => Boolean(body.manifestYaml ?? body.manifest), {
    message: "Either manifestYaml or manifest is required."
});
