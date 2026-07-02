import type { z } from "zod";

import {
    BuildOptionsSchema,
    ManifestDefaultsSchema,
    ManifestNetworkSchema,
    ManifestRegistrySchema,
    ManifestSchema,
    ManifestServiceSchema,
    ManifestVolumeSchema
} from "../schemas/Manifest.js";

export type BuildOptions = z.infer<typeof BuildOptionsSchema>;
export type ManifestDefaults = z.infer<typeof ManifestDefaultsSchema>;
export type ManifestService = z.infer<typeof ManifestServiceSchema>;
export type ManifestVolume = z.infer<typeof ManifestVolumeSchema>;
export type ManifestNetwork = z.infer<typeof ManifestNetworkSchema>;
export type ManifestRegistry = z.infer<typeof ManifestRegistrySchema>;
export type Manifest = z.infer<typeof ManifestSchema>;
