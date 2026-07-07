import type { z } from "zod";

import type {
    ContainerRegistryDestinationSchema,
    ContainerRegistryImageSchema,
    LocalContainerRegistryDestinationSchema,
    NodeContainerRegistryDestinationSchema,
    PluginContainerRegistryDestinationSchema,
    S3ContainerRegistryDestinationSchema
} from "../schemas/ContainerRegistry";

export type LocalContainerRegistryDestination = z.infer<typeof LocalContainerRegistryDestinationSchema>;
export type NodeContainerRegistryDestination = z.infer<typeof NodeContainerRegistryDestinationSchema>;
export type S3ContainerRegistryDestination = z.infer<typeof S3ContainerRegistryDestinationSchema>;
export type PluginContainerRegistryDestination = z.infer<typeof PluginContainerRegistryDestinationSchema>;
export type ContainerRegistryDestination = z.infer<typeof ContainerRegistryDestinationSchema>;
export type ContainerRegistryImage = z.infer<typeof ContainerRegistryImageSchema>;
