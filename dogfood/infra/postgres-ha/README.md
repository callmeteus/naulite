# Postgres HA (dogfood)

Primary + streaming replica + Pgpool-II for local Platform dogfood.

## Services

| Service | Role |
|---------|------|
| `postgres-primary` | Read/write PostgreSQL with `wal_level=replica` |
| `postgres-replica` | Hot standby cloned via `pg_basebackup` |
| `pgpool` | Connection pool and read load balancing (`5432`) |

Apps connect to **`pgpool:5432`**, not the backends directly.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_PASSWORD` | `platform` | App user password (`platform` database user) |
| `POSTGRES_REPLICATION_USER` | `replicator` | Replication role created on primary init |
| `POSTGRES_REPLICATION_PASSWORD` | `replicator` | Password for the replication user |
| `POSTGRES_HA_ENABLED` | `true` | Flag written by bootstrap install script |
| `DATABASE_URL` | *(unset)* | Optional override for external RDS; default is `@pgpool:5432` |

## Image tags

- PostgreSQL: `postgres:16-alpine`
- Pgpool-II: `pgpool/pgpool:4.4.3` ([Docker Hub tags](https://hub.docker.com/r/pgpool/pgpool/tags) - `4.5.3` is not published)

## First boot

1. Primary runs init scripts in `init/primary/` and creates the replication user.
2. Replica waits for primary health, then runs `pg_basebackup -R`.
3. Pgpool waits for both backends, then accepts connections on port `5432`.

To reset the cluster, remove the `postgres-primary-data` and `postgres-replica-data` volumes.
