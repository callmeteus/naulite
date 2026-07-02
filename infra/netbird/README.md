# NetBird (self-hosted, internal)

Official NetBird stack for Platform. Images: `netbirdio/netbird-server` and `netbirdio/dashboard`.

NetBird runs on the internal Docker network. The dashboard is **not** exposed on host ports. The control plane bootstraps credentials automatically on first startup.

## Option A - local dogfood (no Traefik / no public domain)

Generates `config.yaml` and `dashboard.env` and uses the `docker-compose.yml` in this folder.

```bash
export NETBIRD_DOMAIN=netbird.local
export NETBIRD_HTTP_PROTOCOL=http
export NETBIRD_SERVER_PORT=9081
bash scripts/init-netbird-config.sh
```

Or use `./bin/dev.sh` / `./bin/dev.ps1` from the platform root (config + compose + admin API key).

## Option B - production (official script + Traefik + TLS)

Requires a public domain pointing at the host and free ports 80/443.

```bash
export NETBIRD_DOMAIN=vpn.example.com
export NETBIRD_LETSENCRYPT_EMAIL=admin@example.com
bash scripts/setup-netbird.sh
```

## Run with Platform

From the monorepo root:

```bash
docker compose up -d --build
```

The control plane talks to NetBird on the Docker `netbird` network (`http://netbird-server/api`). No manual API token is required.

`netbird-server` must have `NB_SETUP_PAT_ENABLED=true` (already set in `docker-compose.yml` here).

## Internal credentials

Stored in the control plane database secret `netbird/internal`:

| Key | Purpose |
|-----|---------|
| `apiToken` | NetBird API PAT used by the control plane |
| `superadminEmail` | Embedded IdP owner email |
| `superadminPassword` | Embedded IdP owner password |

These values are never exposed through the admin UI or public APIs.

## Ports (option A)

| Service | Exposure |
|---------|----------|
| Dashboard | Internal Docker network only |
| Management API | Host `${NETBIRD_SERVER_PORT:-9081}` (optional; CP uses internal URL) |
| STUN | `3478/udp` on host |

## Generated files (not versioned)

`config.yaml`, `dashboard.env`, and `docker-compose.yml` (after production setup) are listed in `.gitignore`.
