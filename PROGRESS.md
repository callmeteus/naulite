# Development Progress

**Last updated:** 2026-07-02

## Overview

| Phase | Status | Started | Completed |
|-------|--------|---------|-----------|
| 0 - Foundation | completed | 2026-07-02 | 2026-07-02 |
| 1 - Agent | completed | 2026-07-02 | 2026-07-02 |
| 2 - Control Plane | completed | 2026-07-02 | 2026-07-02 |
| 3 - Orchestration | completed | 2026-07-02 | 2026-07-02 |
| 4 - Providers | completed | 2026-07-02 | 2026-07-02 |
| 5 - NetBird | completed | 2026-07-02 | 2026-07-02 |
| 6 - GitOps | completed | 2026-07-02 | 2026-07-02 |
| 7 - CLI | completed | 2026-07-02 | 2026-07-02 |
| 8 - UI | completed | 2026-07-02 | 2026-07-02 |
| 9 - HA Dogfood | completed | 2026-07-02 | 2026-07-02 |
| 10 - Agent bootstrap | completed | 2026-07-02 | 2026-07-02 |
| p3-ux-quality (partial) | completed | 2026-07-02 | 2026-07-02 |
| Backlog M1-M7 (scaffold) | completed | 2026-07-02 | 2026-07-02 |

## Log

### 2026-07-02 - p3-ux-quality partial (BFF, SDK, CR UI)

- **BFF routes** (`@platform/ui-backend`): `POST /build`, `GET /cr/images`, `DELETE /cr/images/:name/:tag`, `POST /nodes/provision` proxied via `app.controlPlane`
- **SDK** (`@platform/sdk`): `triggerBuild()`, `provisionNode()`; CR methods already present (`listContainerRegistryImages`, `deleteContainerRegistryImage`)
- **UI**: `ContainerRegistryView.vue` lists images from BFF; nav link at `/container-registry` (Portuguese labels)
- **Tests**: 183 unit tests (up from ~72); new BFF route tests and SDK coverage for build/provision
- **Backlog phases implemented (scaffold / integration level)**:
  - Apply teardown e2e harness
  - Backup completion agent callback flow
  - Container registry SDK + control-plane routes + S3 plugin
  - Leader-gated backup and log-rotation schedulers
- **Honest scope note**: BFF and UI views are thin proxies over control-plane APIs. Production hardening (authz per resource, pagination, build status polling, provision progress UI) remains follow-up work.

### 2026-07-02 - Agent and control plane bootstrap

- Agent persists identity in `agent.json` (`/var/lib/platform/agent.json` or `%ProgramData%\Platform\agent.json`)
- Control plane public bootstrap routes: `GET /bootstrap/agent` (setup-key auth), `GET /bootstrap/setup-key` (loopback)
- `POST /nodes/register` remains the only remote write path required for agent enrollment
- Bootstrap scripts: `bootstrap/control-plane-install.{sh,ps1}` and `bootstrap/agent-install.{sh,ps1}`
- Agent install accepts `--host` and `--setup-key`, writes config, installs systemd/Windows service
- Control plane install accepts `--host`, boots Docker Compose stack, prints agent install command with setup key
- Zig style: all `if` / `else` use `{ }` blocks across agent and CLI packages
- Platform docs standardized to English (`zig-guidelines.md`, `admin-auth.md`, `bootstrap.md`)

### 2026-07-02 - V1 implementation complete

- Monorepo foundation: 17 packages, Turbo workspaces, shared ESLint/TSConfig, CI workflow
- `@platform/shared`: Zod schemas, provider interfaces, `PluginRegistry`, `NetworkGroupId`
- `@platform/control-plane`: Fastify REST, Sequelize (SQLite dev + PostgreSQL HA), planner, scheduler, GitOps, NetBird self-hosted
- `@platform/agent` (Zig 0.17): Docker Engine API executor, CP register/heartbeat, instance status callbacks, HTTP server on `std.Io`
- Dogfood compose uses Zig agent image (`packages/agent/Dockerfile`); `infra/agent-dogfood` removed
- `bin/dev.sh` / `bin/dev.ps1`: NetBird config bootstrap, `docker compose up`, auto `ADMIN_API_KEY` when missing
- NetBird credentials bootstrapped automatically into cluster secret `netbird/internal` (no manual token)
- Providers: runtimes (`packages/runtimes/*`), builders (`packages/builders/*`), gateway, `plugin-s3-storage-provider`; local backup/secrets/volumes/log-rotation live in `control-plane/src/modules/`
- `@platform/cli` + `@platform/sdk`: kubectl-style commands via typed HTTP client
- `@platform/ui-frontend` / `@platform/ui-backend`: Vue 3 dashboard + Fastify admin BFF (nodes, services, deploy, backups, container registry); cluster state via Vue `reactive()`
- Tests: 183 unit tests, e2e harness with real control plane + Zig agent (`LocalTestCluster`)
- Examples: minimal, app-with-db, rushpedia overlays, minecraft, with-defaults
- Dogfood: `docker-compose.yml` with HA control plane, Postgres, MinIO, UI, NetBird, `agent-1`
- Control plane database uses **Sequelize** + **sequelize-typescript** (SQLite dev, PostgreSQL HA)
- Control plane Dockerfile builds `packages/plugins/s3-storage-provider` (not legacy `plugins/s3`)

### 2026-07-02 - Monorepo foundation scaffold

- Created `packages/shared` with Zod schemas, provider interfaces, and `PluginRegistry`
- Created `packages/sdk` typed HTTP client for control plane routes
- Created `packages/cli` Zig CLI with strings in `src/i18n.zig` (cluster `<resource> <action>`: nodes get, manifests apply, backups run, etc.)
- Created `packages/ui` Vue 3 + Vite minimal dashboard (nodes, services, deploy, backups); cluster state via Vue `reactive()` in `stores/Cluster.ts`; UI strings in `packages/ui/packages/frontend/src/ui/en.json`
- Added `tests/harness/LocalTestCluster`, docker compose fixtures, unit tests, and e2e health smoke
- Added `CONTEXT.md`, root `README.md`, `docs/*`, and GitHub Actions CI workflow
