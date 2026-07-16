# @naulite/plugin-s3-storage-provider

S3-compatible object storage plugin for platform backups and the private container registry.

## Overview

| Role | Description |
| ---- | ----------- |
| `BackupDestinationProvider` | Volume backup archives under configurable prefix |
| `ContainerRegistryBlobProvider` | Docker save tarballs under `cr/{name}/{tag}.tar` |

Both adapters share `S3ObjectStore` for put/get/head/delete against S3-compatible APIs (MinIO in dev).

## Manifest

Provider id remains `s3`:

```yaml
destination:
  provider: s3
  bucket: naulite-storage
  prefix: cluster-a
  region: us-east-1
  credentialsSecret:
    secretName: s3-creds
```

See [CONTEXT.md](../../CONTEXT.md) for architecture.

See [../../README.md](../../README.md) for monorepo setup.
