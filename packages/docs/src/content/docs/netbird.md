---
title: NetBird
description: Self-hosted NetBird requirements and control plane bootstrap.
---

# NetBird

Platform requires a **self-hosted NetBird** deployment. NetBird cloud (`api.netbird.io`, `*.netbird.io`) is not supported.

NetBird is an **internal platform component**. End users do not configure tokens or open the NetBird dashboard. The control plane bootstraps NetBird on first startup and stores credentials in the cluster secret `netbird/internal`.

## Why self-hosted

- Private mesh traffic stays on your infrastructure
- ACLs and device enrollment are under your control
- Internal service exposure uses NetBird groups managed by the control plane

## Required configuration

| Component | Variable | Example |
|-----------|----------|---------|
| Control plane | `NETBIRD_API_URL` | `http://netbird-server/api` (Docker default) |
| Agent | `NETBIRD_MANAGEMENT_URL` | `http://netbird-server` |
| Agent | `NETBIRD_SETUP_KEY` | Enrollment key (agent bootstrap scripts) |

`NETBIRD_TOKEN` is **not** required for normal operation. The control plane creates the first owner user and personal access token via `POST /api/setup` when `NB_SETUP_PAT_ENABLED=true` on `netbird-server`, then persists:

- `apiToken` - NetBird API personal access token (365-day internal PAT)
- `superadminEmail` - `superadmin@platform.internal`
- `superadminPassword` - random password for the embedded IdP owner account

Set `NETBIRD_TOKEN` only for one-time recovery when NetBird was initialized outside Platform.

## Automatic bootstrap

1. `netbird-server` starts with `NB_SETUP_PAT_ENABLED=true`
2. Control plane polls `GET /api/instance` until the management API is reachable
3. When `setup_required` is true, control plane calls `POST /api/setup` with `create_pat: true`
4. Credentials are stored in the database secret `netbird/internal` (never returned by list APIs)
5. Subsequent startups read the secret; HA control plane instances coordinate via the database

The NetBird dashboard container stays on the internal Docker network only (no host port published).

## Docker dogfood stack

The root `docker-compose.yml` includes `infra/netbird/docker-compose.yml` with the official `netbirdio/netbird-server` and `netbirdio/dashboard` images.

```bash
./bin/dev.sh
# or
./bin/dev.ps1
```

### First-time config files

```bash
cp .env.example .env
export NETBIRD_DOMAIN=netbird.local
bash scripts/init-netbird-config.sh
docker compose up -d --build
```

### Production (official script + Traefik + TLS)

```bash
export NETBIRD_DOMAIN=vpn.example.com
export NETBIRD_LETSENCRYPT_EMAIL=admin@example.com
bash scripts/setup-netbird.sh
docker compose up -d --build
```

See `infra/netbird/README.md` for details.

## Unit tests

The test cluster in `tests/fixtures/docker-compose.test-cluster.yml` uses `netbird-mock`. For CP unit tests without HTTP, set `PLATFORM_NETBIRD_MOCK=1`.

## Control plane integration

On manifest apply, the control plane:

1. Generates NetBird group ids for non-local networks
2. Ensures groups and ACLs through the self-hosted API using the stored PAT
3. Tracks `netbirdDeviceId` on registered nodes

See [Networks](/networks/) for manifest networking rules.
