# @naulite/plugin-s3-storage-provider

S3-compatible object storage plugin for platform backups and the private container registry.

## Roles

- `BackupDestinationProvider` - volume backup archives under configurable prefix
- `ContainerRegistryBlobProvider` - docker save tarballs under `cr/{name}/{tag}.tar`

## Manifest

The manifest provider id remains `s3`:

```yaml
destination:
  provider: s3
  bucket: naulite-storage
  prefix: cluster-a
  region: us-east-1
  credentialsSecret:
    secretName: s3-creds
```

## Core

Both adapters share {@link S3ObjectStore} for put/get/head/delete operations against S3-compatible APIs (MinIO in dev).
