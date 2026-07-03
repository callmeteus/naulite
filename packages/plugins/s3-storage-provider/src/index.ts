import {
    S3BackupDestinationProvider,
    createS3BackupDestinationProvider,
    s3BackupDestinationProvider
} from "./S3BackupDestinationProvider";
export type { S3BackupDestinationProviderOptions } from "./S3BackupDestinationProvider";
export {
    S3ObjectStore,
    type S3ObjectHeadResult,
    type S3ObjectStoreConfig,
    type S3ObjectStoreOptions
} from "./S3ObjectStore";
export {
    S3ContainerRegistryBlobProvider,
    createS3ContainerRegistryBlobProvider,
    s3ContainerRegistryBlobProvider
} from "./S3ContainerRegistryBlobProvider";
export type { S3ContainerRegistryBlobProviderOptions } from "./S3ContainerRegistryBlobProvider";

/**
 * Plugin registration metadata for the S3 storage provider.
 */
export const s3StoragePluginRegistration = {
    id: "s3",
    type: "backupDestination" as const,
    version: "0.1.0",
    backupDestinationProvider: s3BackupDestinationProvider,
    containerRegistryBlobProvider: s3ContainerRegistryBlobProvider
};

/**
 * Legacy alias for plugin registration metadata.
 */
export const s3BackupPluginRegistration = s3StoragePluginRegistration;

/**
 * Default plugin export for auto-discovery.
 */
export default s3StoragePluginRegistration;

export {
    S3BackupDestinationProvider,
    createS3BackupDestinationProvider,
    s3BackupDestinationProvider
};
