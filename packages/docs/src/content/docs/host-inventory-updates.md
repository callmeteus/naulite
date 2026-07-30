---
title: Host inventory and updates
description: Collect Linux host package inventory and run remote package or system updates from the control plane.
---

# Host inventory and updates

Naulite agents on Linux nodes can report operating system metadata, installed package inventory, and run remote package or system updates through the control plane.

## What is collected

- Operating system family, version, and CPU architecture during register and heartbeat
- Package manager detection for `apt`, `dnf`, `yum`, `pacman`, and `zypper`
- Installed package versions and available upgrades
- Historical host update runs with reboot guidance

## API

| Method | Path | Permission |
|--------|------|------------|
| `GET` | `/nodes/:id/host/inventory` | `nodes:read` |
| `POST` | `/nodes/:id/host/inventory/refresh` | `nodes:read` |
| `POST` | `/nodes/:id/host/packages/update` | `nodes:host-update` |
| `POST` | `/nodes/:id/host/system/update` | `nodes:host-update` |
| `GET` | `/nodes/:id/host/updates` | `nodes:read` |

Use `?refresh=true` on the inventory `GET` route to collect a fresh snapshot from the agent.

## Agent tasks

The control plane dispatches these agent endpoints:

- `POST /tasks/host-inventory`
- `POST /tasks/package-update`
- `POST /tasks/system-update`

## CLI

```bash
naulite cluster nodes inventory get <nodeId> [--refresh]
naulite cluster nodes packages update <nodeId> [--packages openssl,curl]
naulite cluster nodes system update <nodeId>
naulite cluster nodes updates get <nodeId>
```

## Test stub

Set `NAULITE_HOST_PM_STUB=1` on an agent to return deterministic inventory and update responses without calling a real package manager. The e2e test cluster enables this variable for agent containers.

## Requirements

- Linux agents with root privileges for package manager commands
- Windows and macOS agents report OS metadata only; package inventory and updates return `unsupported_os`
