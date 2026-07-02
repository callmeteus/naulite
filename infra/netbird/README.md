# NetBird (self-hosted)

Official NetBird stack for Platform. Images: `netbirdio/netbird-server` and `netbirdio/dashboard`.

## Option A - local dogfood (no Traefik / no public domain)

Generates `config.yaml` and `dashboard.env` and uses the `docker-compose.yml` in this folder.

```bash
export NETBIRD_DOMAIN=netbird.local
export NETBIRD_HTTP_PROTOCOL=http
export NETBIRD_SERVER_PORT=9081
bash scripts/init-netbird-config.sh
```

Add `127.0.0.1 netbird.local` to your hosts file if you want to open the dashboard by hostname.

## Option B - production (official script + Traefik + TLS)

Requires a public domain pointing at the host and free ports 80/443.

```bash
export NETBIRD_DOMAIN=vpn.example.com
export NETBIRD_LETSENCRYPT_EMAIL=admin@example.com
bash scripts/setup-netbird.sh
```

On Windows (Git Bash or WSL):

```powershell
$env:NETBIRD_DOMAIN = "vpn.example.com"
$env:NETBIRD_LETSENCRYPT_EMAIL = "admin@example.com"
.\scripts\setup-netbird.ps1
```

The official script replaces `docker-compose.yml` with a stack that includes Traefik and Let's Encrypt.

## Run with Platform

From the monorepo root:

```bash
docker compose up -d
```

The control plane talks to NetBird on the Docker `netbird` network (`http://netbird-server/api`). Set `NETBIRD_TOKEN` in `.env` after creating a token in the NetBird dashboard.

## Default ports (option A)

| Service | Host port |
|---------|-----------|
| Dashboard | 9080 |
| Management API | 9081 |
| STUN | 3478/udp |

## Generated files (not versioned)

`config.yaml`, `dashboard.env`, and `docker-compose.yml` (after production setup) are listed in `.gitignore`.
