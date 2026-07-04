---
title: Get started
description: What Platform is, who it is for, and prerequisites before you install a cluster.
---

# Get started

Platform is a distributed orchestration system for Compose-compatible workloads. You describe desired state in YAML manifests; the control plane validates, plans, and schedules work; agents on each node execute the resulting plans against Docker (or other registered runtimes).

## What you get

| Layer | Responsibility |
|-------|----------------|
| **Manifests** | Compose YAML plus platform extensions (ingress, backups, cluster labels, networks) |
| **Control plane** | HTTP API, orchestration, GitOps, leader election, admin auth |
| **Agents** | Zig executors that run containers, builds, backups, and log rotation on nodes |
| **CLI and dashboard** | `platform` commands and a Vue admin UI for operators |

Platform is a **working alpha scaffold** for local development, integration testing, and internal dogfood. Production hardening (SLOs, full multi-tenant isolation, managed Postgres failover automation) is follow-up work beyond this wave.

## Prerequisites

### Control plane host

- **Docker** and the **Docker Compose** plugin
- **Linux, macOS, or Windows** with PowerShell for the Windows installers
- A reachable **public URL** for agent enrollment (`PLATFORM_PUBLIC_URL`)
- **Self-hosted NetBird** management (cloud `api.netbird.io` is rejected)

### Agent nodes

- Docker (installed by `agent-install.sh` when missing on Linux)
- Outbound HTTPS to the control plane enrollment routes
- Docker socket access (`/var/run/docker.sock` on Linux, named pipe on Windows)

### Operator workstation

- Node.js 22+ and Yarn (for building the CLI and docs locally)
- `platform` CLI built from `packages/cli` with `PLATFORM_CP_URL` pointing at your cluster

## Next steps

1. [Install the control plane and agents](/get-started/install/)
2. [Choose a database backend](/get-started/database/)
3. [Apply your first workload](/get-started/first-workload/)

For development-only quick starts without full bootstrap, see the [Dogfood README](/dogfood/readme/). For incident response after the cluster is running, see the [Operations runbook](/operations/runbook/).
