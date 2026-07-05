---
title: Install
description: Control plane and agent bootstrap scripts, environment variables, and post-install verification.
---

# Install

Naulite ships one-liner installers under `bootstrap/` at the repository root. They detect the host OS, prepare Docker Compose (control plane) or a systemd/Windows service (agent), and wire NetBird enrollment.

## Control plane

From the platform monorepo root on a Docker host:

```bash
sudo bash bootstrap/control-plane-install.sh --host https://cp.example.com
```

Windows:

```powershell
.\bootstrap\control-plane-install.ps1 -HostUrl https://cp.example.com
```

The script:

1. Copies `dogfood/.env.example` to `dogfood/.env` when missing
2. Writes `NAULITE_PUBLIC_URL` and NetBird public URLs
3. Initializes NetBird config when absent
4. Starts the metrics stack and `docker compose up -d --build` under `dogfood/`
5. Waits for `GET /health`
6. Creates `ADMIN_API_KEY` when empty
7. Fetches a reusable NetBird setup key from `GET /bootstrap/setup-key` (loopback only)
8. Prints the agent install command

### Control plane options

| Flag | Purpose |
|------|---------|
| `--host <url>` | Public control plane URL shown to enrolling agents (required) |
| `--netbird-domain` | NetBird domain for local dogfood (default: `netbird.local`) |
| `--netbird-public-management-url` | Public NetBird URL returned to agents |
| `--dry-run` | Validate arguments and write `dogfood/.env` only |

## Agent

On a worker machine:

```bash
curl -fsSL https://example.com/bootstrap/agent-install.sh | sudo bash -s -- \
  --host https://cp.example.com \
  --setup-key <setup-key-from-control-plane-bootstrap>
```

Windows:

```powershell
.\bootstrap\agent-install.ps1 -HostUrl https://cp.example.com -SetupKey <setup-key>
```

The script:

1. Optionally calls `GET /bootstrap/agent` with `X-Platform-Setup-Key` to resolve `netbirdManagementUrl`
2. Writes `/var/lib/naulite/agent.json` (or `%ProgramData%\naulite\agent.json` on Windows)
3. Installs or builds the Zig agent binary
4. Starts a systemd or Windows service with `NAULITE_AGENT_CONFIG` pointing at the JSON file

### Agent options

| Flag / env | Purpose |
|------------|---------|
| `--host` / `NAULITE_CP_URL` | Control plane base URL |
| `--setup-key` / `NAULITE_SETUP_KEY` | NetBird enrollment setup key |
| `--provision-id` / `NAULITE_PROVISION_ID` | Correlates cloud-init provisioning with agent registration |
| `--node-id` / `NAULITE_NODE_ID` | Pre-assigned node id from provision flow |
| `--labels` / `NAULITE_LABELS` | JSON node labels for scheduling |
| `--capabilities` / `NAULITE_CAPABILITIES` | JSON capability list |
| `--dry-run` | Parse arguments and write config only |

## Environment variables

### Control plane (common)

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | SQLite path when unset | `postgres://` or `postgresql://` for HA; otherwise SQLite |
| `DATABASE_PATH` | `./data/control-plane.db` | SQLite file when `DATABASE_URL` is not PostgreSQL |
| `DATABASE_SSL` | `false` | Enable TLS for external PostgreSQL (e.g. RDS) |
| `NAULITE_PUBLIC_URL` | empty | Public URL returned to enrolling agents |
| `CP_INSTANCE_ID` | random | Unique id for this control plane replica |
| `CP_PEER_URLS` | empty | Comma-separated peer URLs for HA sync |
| `NAULITE_MULTI_TENANT` | `false` | When `true`, enables tenant-scoped data access |
| `NAULITE_API_KEY_ROTATION_ENABLED` | `false` | When `true`, allows `POST /api-keys/:id/rotate` |
| `NAULITE_API_KEY_ROTATION_GRACE_SECONDS` | `86400` | Grace period for the previous key hash after rotation |
| `NETBIRD_MANAGEMENT_URL` | internal compose URL | Self-hosted NetBird management (required) |
| `NETBIRD_PUBLIC_MANAGEMENT_URL` | derived | Public NetBird URL for agent enrollment |
| `ADMIN_API_KEY` | auto-created in dogfood | Service token for admin API and metrics |
| `NAULITE_TLS_MODE` | `acme_tls` | Traefik TLS mode (`acme_tls`, `acme_dns_cloudflare`, `passthrough`, `self_signed`, `custom`) |
| `ACME_EMAIL` | `platform@localhost` | ACME registration email for Let's Encrypt |
| `ACME_CA_SERVER` | Let's Encrypt staging | ACME directory URL |
| `CF_DNS_API_TOKEN` | empty | Cloudflare DNS token when using `acme_dns_cloudflare` |

See [TLS modes](/get-started/tls/) for mode details and manifest secret references.

### Agent (common)

| Variable | Purpose |
|----------|---------|
| `NAULITE_CP_URL` | Control plane base URL (runtime override) |
| `NAULITE_AGENT_CONFIG` | Path to persisted `agent.json` |
| `NAULITE_NODE_LABELS` | Optional JSON labels for scheduling |
| `NETBIRD_SETUP_KEY` | NetBird enrollment key |
| `NETBIRD_MANAGEMENT_URL` | Self-hosted NetBird management URL |

NetBird cloud (`api.netbird.io`) is not supported. See [NetBird](/netbird/).

## Dry-run validation

Both shell installers support `--dry-run` for validation without root, Docker, or systemd:

```bash
bash bootstrap/agent-install.sh --dry-run \
  --host https://cp.example.com \
  --setup-key <key> \
  --config-path /tmp/agent.json

NAULITE_ROOT=/tmp/naulite-bootstrap bash bootstrap/control-plane-install.sh --dry-run \
  --host https://cp.example.com
```

## Post-install verification

```bash
export NAULITE_CP_URL=https://cp.example.com
platform cluster status get
platform cluster nodes get
```

Nodes should report `online` after the first heartbeat. Continue with [database setup](/get-started/database/) and [your first workload](/get-started/first-workload/).

For enrollment route details and agent JSON fields, see [Bootstrap](/bootstrap/).
