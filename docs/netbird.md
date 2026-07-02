# NetBird

Platform requires a **self-hosted NetBird** deployment. NetBird cloud (`api.netbird.io`, `*.netbird.io`) is not supported.

## Why self-hosted

- Private mesh traffic stays on your infrastructure
- ACLs and device enrollment are under your control
- CLI remote access and internal service exposure use your NetBird IPs

## Required configuration

| Component | Variable | Example |
|-----------|----------|---------|
| Control plane | `NETBIRD_API_URL` | `https://vpn.example.com/api` |
| Control plane | `NETBIRD_TOKEN` | API token from your NetBird dashboard |
| Agent | `NETBIRD_MANAGEMENT_URL` | `https://vpn.example.com` |
| Agent | `NETBIRD_SETUP_KEY` | Enrollment key (bootstrap scripts) |

`NETBIRD_API_URL` may also be read by agents when `NETBIRD_MANAGEMENT_URL` is unset. Values ending in `/api` are normalized to the management host automatically.

## Docker dogfood stack

The root `docker-compose.yml` includes `infra/netbird/docker-compose.yml` with the official `netbirdio/netbird-server` and `netbirdio/dashboard` images.

### First-time setup

**Local (no TLS):**

```bash
cp .env.example .env
export NETBIRD_DOMAIN=netbird.local
bash scripts/init-netbird-config.sh
docker compose up -d --build
```

**Production (official script + Traefik + Let's Encrypt):**

```bash
export NETBIRD_DOMAIN=vpn.example.com
export NETBIRD_LETSENCRYPT_EMAIL=admin@example.com
bash scripts/setup-netbird.sh
docker compose up -d --build
```

On Windows, use `scripts/setup-netbird.ps1` (Git Bash or WSL).

See `infra/netbird/README.md` for details.

### Control plane in Compose

By default the CP uses the Docker `netbird` network:

- `NETBIRD_API_URL=http://netbird-server/api`
- `NETBIRD_MANAGEMENT_URL=http://netbird-server`

With Traefik and a public domain, set the external HTTPS URLs in `.env`.

## Unit tests

The test cluster in `tests/fixtures/docker-compose.test-cluster.yml` still uses `netbird-mock` (minimal HTTP). For CP unit tests without HTTP, set `PLATFORM_NETBIRD_MOCK=1`.

## Control plane integration

On manifest apply, the control plane:

1. Generates NetBird group ids for non-local networks
2. Ensures groups and ACLs through the self-hosted API
3. Tracks `netbirdDeviceId` on registered nodes

See [networks.md](./networks.md) for manifest networking rules.
