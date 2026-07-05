---
title: Failover
description: Control plane leader election and PostgreSQL HA recovery procedures.
---

# Failover

Naulite HA depends on two layers: **control plane leader election** (application coordination) and **PostgreSQL availability** (persistent state). Both must be healthy for mutating API calls and background schedulers to succeed.

## Control plane leader election

When `DATABASE_URL` points to PostgreSQL, each control plane replica runs `LeaderElection` with a lease stored in `control_plane_leaders`:

| Parameter | Default | Purpose |
|-----------|---------|---------|
| Lease TTL | 15 seconds | Leader must renew before expiry |
| Renew interval | 5 seconds | Background renewal loop |

Only the elected leader runs leader-only work:

- Gateway route hydration and reload
- Metrics sync to Prometheus file_sd
- Backup and log rotation schedulers
- Mutating routes guarded by `requireLeader()` (returns HTTP 503 `not_leader` on followers)

### Detecting the current leader

```bash
curl -s -H "Authorization: Bearer $ADMIN_API_KEY" \
  "$NAULITE_CP_URL/health/ready"
```

Check control plane logs for `[leader] acquired lease instanceId=...` on the active replica. Followers log sync events with `[sync] leader changed`.

### Control plane failover (manual)

1. Confirm PostgreSQL is reachable from all replicas (`GET /health/ready` on each instance).
2. If the leader container or VM is down, stop it cleanly or let the lease expire (within one TTL window).
3. A surviving replica acquires the lease on the next renewal tick.
4. Verify the new leader hydrates gateway routes and schedulers restart.
5. Retry failed client requests that received HTTP 503 `not_leader`.

With SQLite, every instance is treated as leader - failover is not supported.

### Load balancer guidance

Terminate TLS at your load balancer and forward to any healthy control plane replica. Read-only routes work on followers; writes and apply operations must hit the leader or receive a retryable 503 with `leaderId` in the response body.

## PostgreSQL HA failover

Production installs use **pgpool-II** in front of primary and standby PostgreSQL (see [Database](/get-started/database/)). When the primary fails:

1. pgpool detects the primary is unreachable
2. A standby is promoted (operator automation or manual `pg_ctl promote`)
3. pgpool repoints write traffic to the new primary
4. Control plane replicas continue using the same `DATABASE_URL` host (pgpool)

### Operator checklist

| Step | Action |
|------|--------|
| 1 | Confirm symptom: `GET /health/ready` fails with database errors on all CP instances |
| 2 | Check pgpool and Postgres container or VM logs |
| 3 | Verify standby replication lag before promotion |
| 4 | Promote standby per your runbook (pgpool auto-failover or manual) |
| 5 | Rebuild former primary as a new standby |
| 6 | Confirm `control_plane_leaders` row is writable and leader renews |

### External RDS failover

When using managed PostgreSQL, failover is handled by the cloud provider (Multi-AZ). Update security groups if the endpoint changes. Control plane pods may need a brief reconnect window while RDS swaps the primary.

## End-to-end apply during CP failover

Integration tests cover `ha-failover-apply`: killing the leader mid-apply should allow a surviving replica to complete the revision once it acquires the lease. Collect apply revision id and agent logs if an apply stalls across failover.

## Related

- [Migrations](/operations/migrations/) - schema changes during rolling upgrades
- [Operations runbook](/operations/runbook/) - incident triage
