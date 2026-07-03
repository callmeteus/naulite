---
title: Operations runbook
description: Dogfood and staging operational procedures for Platform clusters.
---

# Operations runbook

Procedures for operators running the Platform dogfood stack or a small staging cluster. Production hardening is follow-up work beyond the alpha scaffold.

## Health checks

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Liveness |
| `GET /health/ready` | Readiness (database and dependencies) |
| `GET /health/live` | Lightweight alive probe |

From the CLI (with `PLATFORM_CP_URL` set):

```bash
platform cluster status get
platform cluster nodes get
```

Nodes should report `online` after the first heartbeat post-bootstrap.

## Start and stop (dogfood)

```bash
# Linux/macOS/Git Bash
./bin/dev.sh

# Windows PowerShell
./bin/dev.ps1
```

Stop the stack:

```bash
docker compose down
```

## Bootstrap new nodes

See [Bootstrap](/bootstrap/) for control plane and agent one-liners, setup keys, and dry-run validation.

Post-bootstrap verification:

```bash
platform cluster nodes get
```

## Apply a manifest

```bash
platform cluster apply -f path/to/manifest.compose.yml
```

GitOps webhook and revision rollback are documented in the repository `CONTEXT.md`.

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

## Escalation data to collect

1. Control plane logs and `GET /health/ready` response
2. Affected node id and `platform cluster nodes get` output
3. Recent apply revision id and manifest name
4. Agent logs on the scheduled node
