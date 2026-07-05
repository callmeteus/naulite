---
title: Operations runbook
description: Incident response procedures for Naulite clusters.
---

# Operations runbook

Incident-focused procedures for operators running a Naulite dogfood or staging cluster. For installation, database setup, and first apply, start with [Get started](/get-started/).

## Health checks

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Liveness |
| `GET /health/ready` | Readiness (database and dependencies) |
| `GET /health/live` | Lightweight alive probe |

From the CLI (with `NAULITE_CP_URL` set):

```bash
platform cluster status get
platform cluster nodes get
```

Nodes should report `online` after the first heartbeat post-bootstrap.

## Backups and log rotation

| Task | Command |
|------|---------|
| List backup runs | `platform cluster backups get` |
| Trigger backup | `platform cluster backups run <volumeName>` |
| Restore | `platform cluster backups restore <backupId>` |
| Rotate logs | `platform cluster services rotate-logs <serviceName>` |

See [Backups](/backups/) and [Log rotation](/log-rotation/).

## Admin dashboard

Dogfood uses service-token auth via `ADMIN_API_KEY` in `.env`. See [Admin authentication](/admin-auth/).

## Common issues

| Symptom | Check |
|---------|-------|
| Agent stays offline | Agent HTTP URL reachable from control plane; `agent.json` path; Docker socket |
| NetBird enrollment fails | Self-hosted management URL only; setup key from bootstrap |
| Apply stuck | Agent logs; scheduler node labels vs manifest `cluster.labels` |
| Metrics empty | `GET /metrics` requires local or API key auth; Prometheus URL in dogfood compose |
| HTTP 503 `not_leader` | Retry on leader replica; see [Failover](/operations/failover/) |
| Database readiness fails | `DATABASE_URL`, Postgres or pgpool health; see [Database](/get-started/database/) |

## Escalation data to collect

1. Control plane logs and `GET /health/ready` response
2. Affected node id and `platform cluster nodes get` output
3. Recent apply revision id and manifest name
4. Agent logs on the scheduled node
5. Leader instance id and Postgres connectivity if HA symptoms appear

## Related operations guides

- [Failover](/operations/failover/) - control plane leader and PostgreSQL HA
- [Migrations](/operations/migrations/) - rolling deploy schema changes
- [Metrics](/operations/metrics/) - Prometheus scraping
- [AWS provisioner](/operations/aws-provisioner/) - EC2 worker lifecycle
- [Load and chaos testing](/operations/load-chaos/) - local resilience scripts
