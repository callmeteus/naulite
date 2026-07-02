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
