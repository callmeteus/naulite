# Architecture

See [CONTEXT.md](../CONTEXT.md) for the canonical overview. This document summarizes runtime components and request flows.

## Components

### Control plane

- Fastify HTTP API
- Sequelize ORM (`sequelize-typescript`) with SQLite (dev) or PostgreSQL (HA)
- Compose parser, planner, and scheduler
- Plugin loader for `packages/plugins/*`
- Backup and log rotation schedulers
- GitOps revision tracking
- NetBird service integration (self-hosted API only)

### Agent

- Zig binary installed on each node
- REST executor for execution plans
- Backup and log rotation task handlers
- Docker runtime client (V1)
- NetBird enrollment and identity against a self-hosted management URL

### CLI and UI

- CLI is implemented in Zig (`packages/cli/src/`); NPM install via `bin/platform.js` spawning the native binary
- Strings live in `src/i18n.zig`
- UI uses Vue 3, Vite, a `reactive()` cluster store (`packages/ui/packages/frontend/src/stores/Cluster.ts`), and the same SDK through a dev proxy

## Deploy flow

1. User or GitOps delivers a manifest to the control plane.
2. Parser validates Compose and platform extensions.
3. Planner diffs desired vs actual cluster state.
4. Scheduler selects nodes using CPU, memory, disk, labels, and capabilities.
5. Control plane sends execution plans to agents.
6. Agents run containers, volumes, and network wiring locally.
7. Status, health, and metrics flow back to the control plane.

## HA model

Multiple control plane instances share PostgreSQL. Leader-oriented writes and event notifications keep node registrations, secrets, and revision history consistent.

## Testing architecture

`tests/harness/LocalTestCluster` boots a docker compose stack with Postgres, MinIO, two control plane stubs, three agent/worker nodes, and a NetBird mock. Pure unit tests avoid Docker; docker unit and e2e suites reuse the same cluster.
