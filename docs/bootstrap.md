# Bootstrap

Bootstrap scripts install platform node dependencies and register agents with the control plane.

## Goals

- Detect OS and architecture
- Install Docker without sudo where possible
- Install and connect NetBird against your **self-hosted** management URL (cloud endpoints are rejected)
- Install the agent as a systemd service (Linux) or Windows service
- Register the node with the control plane using bootstrap tokens

## Scripts (planned)

| Script | Platform |
|--------|----------|
| `bootstrap/install.sh` | Linux and macOS via `curl \| sh` |
| `bootstrap/install.ps1` | Windows PowerShell |

## Environment variables

| Variable | Purpose |
|----------|---------|
| `PLATFORM_CP_URL` | Control plane registration URL |
| `PLATFORM_BOOTSTRAP_TOKEN` | One-time or scoped enrollment token |
| `PLATFORM_NODE_LABELS` | Optional JSON labels for scheduling |
| `NETBIRD_MANAGEMENT_URL` | Self-hosted NetBird management URL (required) |
| `NETBIRD_SETUP_KEY` | NetBird enrollment key for the node |

NetBird cloud (`api.netbird.io`) is not supported. See [netbird.md](./netbird.md).

## Agent persisted configuration

The Zig agent writes a JSON snapshot of its identity and connectivity settings to disk so it can reconnect after restart without re-supplying environment variables.

| Platform | Default path |
|----------|--------------|
| Linux / macOS | `/var/lib/platform/agent.json` |
| Windows | `%ProgramData%\Platform\agent.json` |

Override with `PLATFORM_AGENT_CONFIG`.

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

### Future one-liner bootstrap

Planned install scripts will accept `--setup-key` and `--host` (control plane public URL). Only the node registration route needs to be exposed on the internet for enrollment; exposing the full control plane API remains optional and operator-dependent.

## Post-bootstrap verification

```bash
platform cluster nodes get
```

The node should report `online` with resource telemetry after the first heartbeat.

## Development cluster

For local testing without full bootstrap, use the docker compose test cluster:

```bash
docker compose -f tests/fixtures/docker-compose.test-cluster.yml up -d --build
```

See `tests/harness/LocalTestCluster.ts` for programmatic start/stop in tests.
