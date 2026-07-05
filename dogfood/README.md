# Naulite dogfood stack

Local full-stack environment for Naulite development: HA control plane, Postgres, MinIO, UI, NetBird, agent, and optional Prometheus metrics.

## Quick start

From the naulite monorepo root:

```bash
yarn dev:docker
```

Or run the scripts directly:

```bash
./dogfood/bin/dev.sh      # Linux / macOS / Git Bash
./dogfood/bin/dev.ps1     # Windows PowerShell
```

Thin wrappers at `bin/dev.sh` and `bin/dev.ps1` delegate here.

## What it does

1. Creates `dogfood/.env` from `dogfood/.env.example` when missing
2. Derives `NETBIRD_PUBLIC_MANAGEMENT_URL` from `NETBIRD_DOMAIN`, `NETBIRD_HTTP_PROTOCOL`, and `NETBIRD_SERVER_PORT` when unset
3. Bootstraps NetBird config under `dogfood/infra/netbird/` when `config.yaml` is absent
4. Runs `docker compose up -d --build` from this directory
5. Creates `ADMIN_API_KEY` and `NETBIRD_SETUP_KEY` via control plane loopback when empty

## Layout

| Path | Purpose |
|------|---------|
| `docker-compose.yml` | Main stack (build contexts point at `../packages/`) |
| `.env.example` | Environment template |
| `bin/dev.sh`, `bin/dev.ps1` | Bootstrap and start scripts |
| `infra/netbird/` | Self-hosted NetBird server + dashboard |
| `infra/traefik/` | Traefik v3 gateway (`--profile traefik`) |
| `scripts/init-netbird-config.sh` | Generates NetBird `config.yaml` and `dashboard.env` |

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NETBIRD_DOMAIN` | `netbird.local` | NetBird management hostname |
| `NETBIRD_HTTP_PROTOCOL` | `http` | `http` or `https` |
| `NETBIRD_SERVER_PORT` | `9081` | Host port for NetBird management API |
| `NETBIRD_PUBLIC_MANAGEMENT_URL` | *(derived)* | Public URL for remote agent enrollment |
| `NETBIRD_API_URL` | `http://netbird-server/api` | Internal CP to NetBird API |
| `NETBIRD_MANAGEMENT_URL` | `http://netbird-server` | Internal agent to NetBird management |
| `NETBIRD_SETUP_KEY` | *(auto)* | Setup key for dogfood `agent-1` |
| `NAULITE_PUBLIC_URL` | *(empty)* | Public control plane URL for remote agents |
| `ADMIN_API_KEY` | *(auto)* | UI backend API key |
| `NAULITE_BOOTSTRAP_ADMIN_USERNAME` | `admin@naulite.local` | First UI login email (seeded when no users exist) |
| `NAULITE_BOOTSTRAP_ADMIN_PASSWORD` | `naulite-dev` | First UI login password |
| `NAULITE_UI_HOST_PORT` | `13000` | Host port for the admin UI (avoids clashes with local apps on 3000) |
| `POSTGRES_PASSWORD` | `naulite` | Postgres password |
| `NAULITE_PROMETHEUS_HOST_PORT` | `19090` | Host port for included metrics stack |

## Endpoints (default)

| Service | URL |
|---------|-----|
| UI | http://localhost:13000 (login: `admin@naulite.local` / `naulite-dev`) |
| Control plane | http://localhost:8080 |
| Control plane (peer) | http://localhost:8081 |
| Agent | http://localhost:9470/health |
| NetBird management (host) | `http://netbird.local:9081` (derived) |
| Prometheus | http://localhost:19090 |

## Compose profiles

```bash
cd dogfood
docker compose --profile traefik up -d --build
```

## Remote agent bootstrap

After the stack is healthy:

```bash
curl -fsSL <repo>/bootstrap/control-plane-install.sh | bash -s -- \
  --host https://your-public-cp.example.com

curl -fsSL <repo>/bootstrap/agent-install.sh | sudo bash -s -- \
  --host https://your-public-cp.example.com \
  --setup-key <key>
```

`agent-install.sh` accepts `--netbird-management-url`, `--management-url`, or `--url` for the NetBird management endpoint.

## Metrics stack

`docker-compose.yml` includes `../packages/metrics/compose/metrics-stack.yml`. Prometheus starts with the main stack when that file is present.

## Useful commands

```bash
cd dogfood
docker compose logs -f
docker compose down
docker compose ps
```

## Production bootstrap

Use `bootstrap/control-plane-install.sh` for a guided install that writes `dogfood/.env`, initializes NetBird, and prints the agent setup key.

See `dogfood/infra/netbird/README.md` for NetBird-specific details.
