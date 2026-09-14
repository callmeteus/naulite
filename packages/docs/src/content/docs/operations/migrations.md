---
title: Migrations
description: Zero-downtime database migrations with PostgreSQL advisory locks on the leader.
---

# Migrations

The control plane applies schema migrations automatically on startup via `MigrationRunner`. Behavior depends on the active database dialect.

## SQLite (development)

On SQLite, `yarn dev` / control plane startup still calls `sequelize.sync()` so model tables exist, then applies every pending file under `packages/control-plane/src/database/migrations/sqlite/`. Each file is recorded in `schema_migrations`. Duplicate columns and existing tables are skipped so an older local DB (for example missing `pipeline_runs.created_by`) is upgraded on the next boot.

## PostgreSQL (production and HA)

Versioned SQL files live under `packages/control-plane/src/database/migrations/postgresql/`. On each startup:

1. Every control plane instance connects to PostgreSQL
2. On the **first boot** (before `control_plane_leaders` exists), any instance may run the full migration chain
3. On subsequent boots, **leader election starts first**:
   - The elected **leader** runs pending migrations under the PostgreSQL advisory lock (`0x504c5446`)
   - **Followers** skip `migrate()` and poll `waitUntilMigrationsApplied()` until `schema_migrations` is up to date
4. Each applied migration is recorded in `schema_migrations`
5. The advisory lock is released in a `finally` block

This design supports **zero-downtime rolling deploys**: followers wait without blocking on the advisory lock, then start once the leader finishes pending migrations.

## Leader-only migration gate

Schema migration is coordinated with leader election:

- **Bootstrap**: first PostgreSQL startup creates `control_plane_leaders` via the normal migration chain
- **Steady state**: only the lease holder calls `migrate()`; followers call `waitUntilMigrationsApplied()`
- **Leader election**: lease row in `control_plane_leaders` - one leader for schedulers and guarded routes

During a rolling upgrade, deploy control plane replicas one at a time. The elected leader applies pending SQL; followers poll until complete, then serve traffic.

## Adding a new migration

1. Add `NNNN_description.sql` under `packages/control-plane/src/database/migrations/postgresql/` (and the sqlite twin when the change is needed locally). Files are copied to `dist` at build time via `scripts/copy-control-plane-migrations.mjs`. Production **must** pick them up on the next control plane start.
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
