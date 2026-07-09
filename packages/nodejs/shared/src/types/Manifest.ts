import type { z } from "zod";

import type {
    BuildOptionsSchema,
    ManifestBuildSchema,
    ManifestDefaultsSchema,
    ManifestNetworkSchema,
    ManifestRegistrySchema,
    ManifestPipelineNotificationsSchema,
    ManifestSchema,
    ManifestFunctionSchema,
    ManifestServiceSchema,
    ManifestVolumeSchema
} from "../schemas/Manifest";

export type BuildOptions = z.infer<typeof BuildOptionsSchema>;
export type ManifestBuild = z.infer<typeof ManifestBuildSchema>;
export type ManifestDefaults = z.infer<typeof ManifestDefaultsSchema>;
export type ManifestFunction = z.infer<typeof ManifestFunctionSchema>;
export type ManifestService = z.infer<typeof ManifestServiceSchema>;
export type ManifestVolume = z.infer<typeof ManifestVolumeSchema>;
export type ManifestNetwork = z.infer<typeof ManifestNetworkSchema>;
export type ManifestRegistry = z.infer<typeof ManifestRegistrySchema>;
export type ManifestPipelineNotifications = z.infer<typeof ManifestPipelineNotificationsSchema>;
export type Manifest = z.infer<typeof ManifestSchema>;
