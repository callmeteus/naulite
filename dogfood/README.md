<div align="center">

# Naulite dogfood stack

> Local full-stack environment for Naulite development

**HA control plane, Postgres, MinIO, UI, NetBird, agent, and optional Prometheus metrics.**

[![Docker](https://img.shields.io/badge/Runtime-Docker-blue.svg)](#)
[![TypeScript](https://img.shields.io/badge/Control%20Plane-TypeScript-blue.svg)](#)

[Get Started](#get-started) • [Layout](#layout) • [Endpoints](#endpoints-default) • [Environment](#environment-variables)

</div>

---

## What Is dogfood?

The dogfood stack is the local integration environment for [Naulite](../README.md). It boots the control plane, admin UI, object storage, NetBird mesh, and a sample agent in Docker Compose for day-to-day development.

Thin wrappers at the monorepo root delegate here: `bin/dev.sh` and `bin/dev.ps1`.

---

## Get Started

From the Naulite monorepo root:

```bash
yarn dev:docker
```

Or run scripts directly:

```bash
./dogfood/bin/dev.sh      # Linux / macOS / Git Bash
./dogfood/bin/dev.ps1     # Windows PowerShell
```

On first run:

1. Creates `dogfood/.env` from `.env.example` when missing.
2. Derives `NETBIRD_PUBLIC_MANAGEMENT_URL` from NetBird env vars when unset.
3. Bootstraps NetBird config under `infra/netbird/` when `config.yaml` is absent.
4. Runs `docker compose up -d --build`.
5. Creates `ADMIN_API_KEY` and `NETBIRD_SETUP_KEY` via control plane loopback when empty.

---

## Layout

| Path | Purpose |
| ---- | ------- |
| `docker-compose.yml` | Main stack (build contexts under `../packages/`) |
| `.env.example` | Environment template |
| `bin/dev.sh`, `bin/dev.ps1` | Bootstrap and start |
| `infra/netbird/` | Self-hosted NetBird server + dashboard |
| `infra/traefik/` | Traefik v3 gateway (`--profile traefik`) |
| `scripts/init-netbird-config.sh` | Generates NetBird `config.yaml` and `dashboard.env` |

---

## Endpoints (default)

| Service | URL |
| ------- | --- |
| UI | http://localhost:13000 (login: `admin@naulite.local` / `naulite-dev`) |
| Control plane | http://localhost:8080 |
| Control plane (peer) | http://localhost:8081 |
| Agent | http://localhost:9470/health |
| NetBird management (host) | `http://netbird.local:9081` (derived) |
| Prometheus | http://localhost:19090 |

---

## Agent (Docker Desktop / Windows)

Docker Desktop mounts `docker.sock` as `root:root`. Mitigations:

| Mechanism | Purpose |
| --------- | ------- |
| `NAULITE_AGENT_USER=0:0` | Agent runs as root on Windows (set by `bin/dev.ps1`) |
| `tmpfs` at `/var/lib/naulite` | Writable config without volume ownership conflicts |
| `extra_hosts: netbird.local:host-gateway` | Signal/STUN reach host-published NetBird port |

Recreate agent after user/volume changes:

```bash
cd dogfood
docker compose stop agent-1
docker compose rm -f agent-1
docker volume rm naulite_agent-data-1 2>/dev/null || true
docker compose up -d --build agent-1
```

On Linux with `root:docker` socket, keep `NAULITE_AGENT_USER=1000:1000` and set `DOCKER_SOCKET_GID` to the host docker group id.

Verify NetBird:

```bash
docker compose logs agent-1 | grep netbird
docker compose exec agent-1 netbird status
curl -s http://localhost:9470/status
```

---

## Environment variables

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `NETBIRD_DOMAIN` | `netbird.local` | NetBird management hostname |
| `NETBIRD_HTTP_PROTOCOL` | `http` | `http` or `https` |
| `NETBIRD_SERVER_PORT` | `9081` | Host port for NetBird management API |
| `NETBIRD_PUBLIC_MANAGEMENT_URL` | *(derived)* | Public URL for remote agent enrollment |
| `NETBIRD_API_URL` | `http://netbird-server/api` | Internal CP to NetBird API |
| `NETBIRD_MANAGEMENT_URL` | `http://netbird-server` | Internal agent to NetBird management |
| `NETBIRD_SETUP_KEY` | *(auto)* | Setup key for dogfood `agent-1` |
| `NAULITE_PUBLIC_URL` | *(empty)* | Public control plane URL for remote agents |
| `ADMIN_API_KEY` | *(auto)* | UI backend API key |
| `NAULITE_BOOTSTRAP_ADMIN_USERNAME` | `admin@naulite.local` | First UI login email |
| `NAULITE_BOOTSTRAP_ADMIN_PASSWORD` | `naulite-dev` | First UI login password |
| `NAULITE_UI_HOST_PORT` | `13000` | Host port for admin UI |
| `NAULITE_AGENT_USER` | `1000:1000` / `0:0` | Container user (root on Windows Docker Desktop) |
| `DOCKER_SOCKET_GID` | `999` | Supplementary group for docker socket |
| `POSTGRES_PASSWORD` | `naulite` | Postgres password |
| `NAULITE_PROMETHEUS_HOST_PORT` | `19090` | Host port for metrics stack |

---

## Compose profiles

```bash
cd dogfood
docker compose --profile traefik up -d --build
```

---

## Remote agent bootstrap

```bash
curl -fsSL <repo>/bootstrap/control-plane-install.sh | bash -s -- \
  --host https://your-public-cp.example.com

curl -fsSL <repo>/bootstrap/agent-install.sh | sudo bash -s -- \
  --host https://your-public-cp.example.com \
  --setup-key <key>
```

`agent-install.sh` accepts `--netbird-management-url`, `--management-url`, or `--url`.

---

## Useful commands

```bash
cd dogfood
docker compose logs -f
docker compose down
docker compose ps
```

---

## Documentation

- [infra/netbird/README.md](infra/netbird/README.md) - NetBird-specific details.
- [../README.md](../README.md) - Naulite monorepo overview.
- [AGENTS.md](../../../AGENTS.md) - workspace coding standards.

---

## License

Part of the Naulite platform.
