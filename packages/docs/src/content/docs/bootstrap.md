---
title: Bootstrap
description: Install platform nodes and register agents with the control plane.
---

# Bootstrap

Bootstrap scripts install platform nodes and register agents with the control plane.

**New cluster?** Start with [Get started](/get-started/) for prerequisites, install order, and your first workload. This page documents enrollment routes, dry-run mode, and agent persisted configuration in depth.

## Goals

- Detect OS and architecture
- Install Docker without sudo where possible
- Install and connect NetBird against your **self-hosted** management URL (cloud endpoints are rejected)
- Install the agent as a systemd service (Linux) or Windows service
- Register the node with the control plane using setup keys

## Scripts

| Script | Naulite | Purpose |
|--------|----------|---------|
| `bootstrap/control-plane-install.sh` | Linux / macOS | Install control plane stack (Docker Compose) |
| `bootstrap/control-plane-install.ps1` | Windows | Install control plane stack (Docker Compose) |
| `bootstrap/agent-install.sh` | Linux / macOS | Install agent and persist `agent.json` |
| `bootstrap/agent-install.ps1` | Windows | Install agent and persist `agent.json` |
| `bootstrap/install.sh` | Linux / macOS | Alias for `agent-install.sh` |
| `bootstrap/install.ps1` | Windows | Alias for `agent-install.ps1` |

## Control plane one-liner

From the naulite monorepo root on a Docker host:

```bash
sudo bash bootstrap/control-plane-install.sh --host https://cp.example.com
```

Windows:

```powershell
.\bootstrap\control-plane-install.ps1 -HostUrl https://cp.example.com
```

The script:

1. Writes `NAULITE_PUBLIC_URL` (and optional NetBird public URLs) to `.env`
2. Initializes NetBird config when missing
3. Runs `docker compose up -d --build`
4. Waits for `/health`
5. Creates `ADMIN_API_KEY` when empty
6. Fetches a reusable NetBird setup key from `GET /bootstrap/setup-key` (loopback only)
7. Prints the agent install command

## Agent one-liner

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

## Public routes

When the control plane API is private except for enrollment, expose only:

| Route | Auth | Purpose |
|-------|------|---------|
| `POST /nodes/register` | None (remote exempt) | Agent registration and heartbeat identity |
| `GET /bootstrap/agent` | `X-Platform-Setup-Key` header | Returns `cpUrl` and `netbirdManagementUrl` for agent install |

`GET /bootstrap/setup-key` is **loopback only** and used by the control plane install script.

Exposing the full control plane API on the internet remains optional and operator-dependent.

## Dry-run mode

Both shell installers support `--dry-run` for validation without root, Docker, or systemd:

```bash
bash bootstrap/agent-install.sh --dry-run \
  --host https://cp.example.com \
  --setup-key <key> \
  --config-path /tmp/agent.json

NAULITE_ROOT=/tmp/naulite-bootstrap bash bootstrap/control-plane-install.sh --dry-run \
  --host https://cp.example.com
```

Dry-run executes argument parsing and config/env writes only. Unit tests in `tests/unit/bootstrap/` exercise these paths with temporary directories and a mock control plane HTTP server.

## Environment variables

| Variable | Purpose |
|----------|---------|
| `NAULITE_CP_URL` | Control plane base URL (agent runtime override) |
| `NAULITE_PUBLIC_URL` | Public control plane URL returned to enrolling agents |
| `NAULITE_BOOTSTRAP_TOKEN` | Reserved for future scoped enrollment tokens |
| `NAULITE_NODE_LABELS` | Optional JSON labels for scheduling |
| `NETBIRD_MANAGEMENT_URL` | Self-hosted NetBird management URL (control plane internal) |
| `NETBIRD_PUBLIC_MANAGEMENT_URL` | Public NetBird URL returned to enrolling agents |
| `NETBIRD_SETUP_KEY` | NetBird enrollment key for the node |
| `NAULITE_AGENT_CONFIG` | Override path for persisted agent JSON |

NetBird cloud (`api.netbird.io`) is not supported. See [NetBird](/netbird/).

## Agent persisted configuration

The Zig agent writes a JSON snapshot of its identity and connectivity settings to disk so it can reconnect after restart without re-supplying environment variables.

| Naulite | Default path |
|----------|--------------|
| Linux / macOS | `/var/lib/naulite/agent.json` |
| Windows | `%ProgramData%\naulite\agent.json` |

Override with `NAULITE_AGENT_CONFIG`.

### Precedence

1. Defaults baked into the agent binary
2. Values from `agent.json` when the file exists
3. Environment variables (highest priority, useful for dev overrides)

On startup the agent persists the merged configuration. After a successful `POST /nodes/register`, it updates the file with the control plane response (`id`, `hostname`, `agentUrl`, `agentVersion`, `netbirdDeviceId`, etc.).

### JSON fields (camelCase)

| Field | Description |
|-------|-------------|
| `cpUrl` | Control plane base URL |
| `nodeId` | Node id assigned or confirmed by the control plane |
| `hostname` | Hostname reported to the control plane |
| `agentUrl` | Agent HTTP URL reachable by the control plane |
| `agentVersion` | Agent build version |
| `agentPort` | Agent HTTP listen port |
| `dockerSocket` | Docker socket path or Windows named pipe |
| `netbirdManagementUrl` | Self-hosted NetBird management URL |
| `netbirdSetupKey` | NetBird enrollment key from bootstrap |
| `netbirdDeviceId` | NetBird device id after enrollment |

## Post-bootstrap verification

```bash
naulite cluster nodes get
```

The node should report `online` with resource telemetry after the first heartbeat.

## Development cluster

For local testing without full bootstrap, use the docker compose test cluster:

```bash
docker compose -f tests/fixtures/docker-compose.test-cluster.yml up -d --build
```

See `tests/harness/LocalTestCluster.ts` for programmatic start/stop in tests.
