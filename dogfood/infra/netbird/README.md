# NetBird (self-hosted, internal)

Official NetBird stack for Platform. Images: `netbirdio/netbird-server` and `netbirdio/dashboard`.

NetBird runs on the internal Docker network. The dashboard is **not** exposed on host ports. The control plane bootstraps credentials automatically on first startup.

## Option A - local dogfood (no Traefik / no public domain)

Generates `config.yaml` and `dashboard.env` and uses the `docker-compose.yml` in this folder.

```bash
export NETBIRD_DOMAIN=netbird.local
export NETBIRD_HTTP_PROTOCOL=http
export NETBIRD_SERVER_PORT=9081
bash dogfood/scripts/init-netbird-config.sh
```

Or use `./dogfood/bin/dev.sh` / `./dogfood/bin/dev.ps1` from the platform root (config + compose + admin API key).

## Option B - production (official script + Traefik + TLS)

Requires a public domain pointing at the host and free ports 80/443.

```bash
export NETBIRD_DOMAIN=vpn.example.com
export NETBIRD_LETSENCRYPT_EMAIL=admin@example.com
bash scripts/setup-netbird.sh
```

## Traefik gateway (dogfood profile)

Real Traefik v3 with HTTP dynamic config and Let's Encrypt staging ACME lives in `dogfood/infra/traefik/`. Enable it on the dogfood compose stack:

```bash
cd dogfood
docker compose --profile traefik up -d --build
```

The control plane pushes routes to `TRAEFIK_DYNAMIC_CONFIG_URL` (default `http://traefik-dynamic-config:8099/platform/dynamic-config`). Traefik polls the same endpoint via its HTTP provider (`dogfood/infra/traefik/traefik.yml`).

### Smoke test (local ingress)

1. Start the test cluster (real Traefik is the default; set `TRAEFIK_USE_MOCK=true` for the lightweight mock):

```bash
docker compose -f tests/fixtures/docker-compose.test-cluster.yml -p platform-test-cluster --profile real up -d --build
```

2. Apply a public ingress manifest and confirm the route:

```bash
curl -s http://127.0.0.1:18080/gateway/routes | jq .
curl -s http://127.0.0.1:19099/last-config | jq '.http.routers | keys'
```

3. Request the service through Traefik (Host header must match the ingress host):

```bash
curl -s -H "Host: web.test.local" http://127.0.0.1:19080/
```

Expect an nginx welcome page when the `ingress-public` fixture is applied. Port `19443` is mapped for TLS challenge / HTTPS entrypoint checks.

## Run with Platform

From the monorepo root:

```bash
cd dogfood
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
