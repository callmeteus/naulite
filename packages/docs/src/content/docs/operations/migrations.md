---
title: Migrations
description: Zero-downtime database migrations with PostgreSQL advisory locks on the leader.
---

# Migrations

The control plane applies schema migrations automatically on startup via `MigrationRunner`. Behavior depends on the active database dialect.

## SQLite (development)

On SQLite, the runner calls `sequelize.sync()` and records a single `001-initial-schema` migration row. This path is for local dev only - do not rely on it for production schema evolution.

## PostgreSQL (production and HA)

Versioned SQL files live under `packages/control-plane/src/database/migrations/postgresql/`. On each startup:

1. Every control plane instance connects to PostgreSQL
2. Instances contend for a **PostgreSQL advisory lock** (`0x504c5446`) so only one runs migrations at a time
3. Pending `.sql` files are applied in sorted order
4. Each applied migration is recorded in `schema_migrations`
5. The lock is released in a `finally` block

This design supports **zero-downtime rolling deploys**: followers start, block on the advisory lock, and proceed once the leader finishes pending migrations.

## Leader-only mutating routes

Schema migration is not the same as leader election, but both coordinate through PostgreSQL:

- Migrations: advisory lock - any instance may hold the lock first
- Leader election: lease row in `control_plane_leaders` - one leader for schedulers and guarded routes

During a rolling upgrade, deploy control plane replicas one at a time. The first instance to acquire the advisory lock applies pending SQL; others wait briefly then start serving traffic.

## Adding a new migration

1. Add `NNNN_description.sql` under `packages/control-plane/migrations/postgresql/` (copied to `dist` at build time via `scripts/copy-control-plane-migrations.mjs`)
2. Ship the new control plane image to all replicas
3. Roll replicas sequentially; the first starter applies the new file
4. Verify `schema_migrations` contains the new name on the leader database

Never edit or delete applied migration files in place. Add a forward migration instead.

## Verification

After deploy:

```bash
# Readiness should pass on all replicas
curl -s http://localhost:8080/health/ready

# Control plane logs
# [migrations] applied name=0003_example dialect=postgresql
```

## Failure recovery

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| CP stuck starting | Migration SQL error | Fix SQL, redeploy; check Postgres logs |
| Lock held long | Crashed migrator | Confirm no stale session holds advisory lock `0x504c5446` |
| Replica 503 on writes | Not leader | Expected on followers; retry on leader |

## Related

- [Database](/get-started/database/) - connection strings and HA layout
- [Failover](/operations/failover/) - leader and Postgres recovery
