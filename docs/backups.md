# Backups
  
Automated volume backups are declared on volume definitions and orchestrated by the control plane.
  
## Policy model
  
```yaml
volumes:
    postgres-data:
        backup:
            schedule: "0 3 * * *"
            includes:
                - "pgdata/**"
            excludes:
                - "pgdata/pg_wal/**"
            retention:
                maxCount: 14
                maxAgeDays: 90
            destination:
                provider: s3
                bucket: prod-backups
                prefix: app/postgres/
```
  
## Destinations
  
| Provider | Package | Notes |
|----------|---------|-------|
| `local` | `backups` | Path on the same node |
| `node` | `backups` | Copy to a peer agent via `/backups/receive` |
| `s3` | `s3-storage-provider` | S3-compatible storage (MinIO in dev) |
| future | `plugin-*` | Azure, GCS, Vault, etc. |
  
## Execution flow
  
1. Backup scheduler detects a due policy.
2. Scheduler selects a node that mounts the volume.
3. Control plane sends `backupTask` to the agent.
4. Agent archives paths with includes/excludes.
5. Agent writes to the configured destination provider.
6. Control plane records run status and retention metadata.
  
## CLI operations
  
```bash
platform cluster backups get
platform cluster backups run <volumeName>
platform cluster backups restore <backupId>
```
  
## Restore
  
Restore requests reference a prior backup run id. The control plane coordinates agent-side extraction and volume remount rules according to volume strategy.
