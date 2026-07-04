---
title: Database
description: Bundled PostgreSQL HA with pgpool, external RDS, and SQLite for local development.
---

# Database

The control plane persists cluster state, manifests, secrets metadata, leader leases, and sync events through Sequelize. The active backend is selected from environment variables at startup.

## How the dialect is chosen

`DatabaseProvider.resolveOptionsFromEnv()` inspects `DATABASE_URL`:

| `DATABASE_URL` prefix | Dialect | Use case |
|-----------------------|---------|----------|
| `postgres://` or `postgresql://` | PostgreSQL | Production and HA dogfood |
| Anything else / unset | SQLite | Single-node dev and fast tests |

For SQLite, set `DATABASE_PATH` (default `./data/control-plane.db`) or pass a `sqlite://` URL.

## Bundled PostgreSQL HA (default production path)

The recommended production install bundles **PostgreSQL with pgpool-II** in front of primary and standby replicas. Control plane instances connect to pgpool on a single connection string; pgpool routes writes to the primary and can promote a standby on primary failure.

Typical layout:

```
control-plane-1 ──┐
control-plane-2 ──┼──> pgpool ──> postgres-primary
                  │              └── postgres-standby (streaming replication)
```

Configure every control plane replica with the same URL:

```bash
DATABASE_URL=postgres://platform:<password>@pgpool:5432/platform
```

Why pgpool:

- **Single endpoint** for all control plane pods or compose services
- **Connection pooling** under concurrent API load
- **Automatic failover** to a promoted standby without rewriting `DATABASE_URL` on each CP restart

Leader election, `ControlPlaneSync` event polling, and migration advisory locks all require PostgreSQL. SQLite deployments treat every instance as the implicit leader.

## External RDS (or managed PostgreSQL)

Point `DATABASE_URL` at your managed instance or RDS endpoint instead of the bundled stack:

```bash
DATABASE_URL=postgres://platform:<password>@mydb.abc123.us-east-1.rds.amazonaws.com:5432/platform
DATABASE_SSL=true
```

Checklist:

- Create the `platform` database and a dedicated user with DDL rights for migrations
- Enable SSL (`DATABASE_SSL=true`) for remote endpoints
- Run **at least two** control plane replicas behind a load balancer
- Ensure network reachability from every control plane host to the database security group
- Use RDS Multi-AZ or your operator's HA policy for database failover; pgpool is optional when the cloud provider manages promotion

Migrations use a PostgreSQL advisory lock so only one control plane instance applies pending SQL at a time. See [Migrations](/operations/migrations/).

## SQLite (local development)

When `DATABASE_URL` is unset or not a PostgreSQL URL, the control plane uses SQLite:

```bash
DATABASE_PATH=./data/control-plane.db
```

SQLite is appropriate for:

- Local `yarn dev` without Docker
- Unit tests and fast iteration
- Single control plane process only

Do **not** use SQLite for multi-replica HA. Leader election and cross-instance sync are degraded to single-leader semantics.

## Health checks

Readiness includes database connectivity:

```bash
curl -s http://localhost:8080/health/ready
```

If readiness fails after install, verify `DATABASE_URL`, credentials, and that PostgreSQL accepts connections from the control plane network.

## Related operations

- [Failover](/operations/failover/) - control plane leader promotion and Postgres HA recovery
- [Migrations](/operations/migrations/) - zero-downtime schema upgrades on the leader
