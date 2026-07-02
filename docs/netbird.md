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

## Local development

The docker test cluster provides a `netbird-mock` service. Point both control plane and agents to it:

```bash
NETBIRD_API_URL=http://127.0.0.1:18081/api
NETBIRD_MANAGEMENT_URL=http://127.0.0.1:18081
```

For unit tests without HTTP, set `PLATFORM_NETBIRD_MOCK=1` on the control plane only.

## Control plane integration

On manifest apply, the control plane:

1. Generates NetBird group ids for non-local networks
2. Ensures groups and ACLs through the self-hosted API
3. Tracks `netbirdDeviceId` on registered nodes

See [networks.md](./networks.md) for manifest networking rules.
