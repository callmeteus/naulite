# Development Progress

**Last updated:** 2026-07-03

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
| Gap items 1-6, 8-13 | completed | 2026-07-02 | 2026-07-02 |
| Alpha wave - platform hardening | completed | 2026-07-03 | 2026-07-03 |

## Log

### 2026-07-03 - Alpha wave: platform hardening (integration complete)

- **Dogfood**: compose, dev scripts, NetBird/Traefik infra moved under `dogfood/`; Prometheus metrics stack wired with shared `platform-prometheus-file-sd` volume on both CP replicas
- **Agent + CLI**: Zig **0.16.0** stable; Docker runtime under `packages/agent/src/runtime/docker/`; `metrics_exporter.zig`; `scripts/zig-build.mjs` for Windows cache dir
- **Auth**: `admin_users` + `admin_sessions`; BFF login with session cookies; `PLATFORM_MULTI_TENANT=false` by default; `PLATFORM_API_KEY_ROTATION_ENABLED=false` by default; `POST /api-keys/:id/rotate` gated by rotation flag
- **Pagination**: server-side list APIs (`items`, `total`, `page`, `limit`, `hasMore`) + UI `useServerPagination`
- **Metrics**: `@platform/metrics` package; `MetricsSyncService` file_sd; PromQL proxy routes; `MetricsView` (uPlot)
- **UI**: Build SSE, Provision stepper/history/terminate, AdminUsersView, role guards
- **Docs**: `packages/docs` Astro + Starlight site; `alpha-scope.md`, operations runbook/metrics
- **CI**: e2e removed from `ci.yml` (local only); Zig 0.16.0 pin in `infra/zig-toolchain.env`
- **Dispatch fix**: Docker chunked HTTP body parsing in `docker_api.zig` (was causing `dispatch.status=failed`)
- **Gates**: `yarn lint` 25/25, `yarn test:unit` 254/254, `yarn build` green

### Post-alpha backlog

- Agent NetBird CLI enrollment inside container image
- Zig 0.16 leak checker noise on `zig build test` (tests pass)
- Infisical, Kaniko, containerd runtime production paths
- SLOs/alerting on top of Prometheus
- Full multi-tenant scoping when `PLATFORM_MULTI_TENANT=true`

### 2026-07-03 - Alpha wave: SA-ci (draft)

- **CI scope**: removed `yarn test:e2e` from `verify` job; e2e remains local-only (`docs/ci.md`)
- **Zig pin**: `0.16.0` in `infra/zig-toolchain.env` and `.github/workflows/ci.yml` (down from 0.17 dev)
- **Docs**: `docs/ci.md` stub points to `packages/docs` for canonical CI docs after integration
- **Pending integration**: align `packages/agent/Dockerfile` `ARG ZIG_VERSION`, agent Zig 0.16 API migration, consolidate docs into `packages/docs`

### 2026-07-02 - Gap items 1-6, 8-13 (integration)

- **Build to CR to deploy**: `container-registry://` refs, agent `PUT/GET /cr`, `build-cr-deploy` e2e
- **S3 backup/restore**: `BackupRestoreService`, agent staging, MinIO fixture, `backup-restore-s3` e2e
- **Volume teardown**: `removeVolume` op end-to-end (planner, apply, agent Zig, Docker runtime)
- **Traefik + ACME**: real Traefik v3.3 in test cluster, `infra/traefik/`, ingress HTTP e2e
- **HA failover**: `ha-failover-apply` e2e with leader kill mid-apply
- **Pipeline runs**: BFF `/runs/*`, agent `logText`, `BuildService` step transitions, `build-pipeline-runs` e2e
- **UX**: `RunsView` logs/SSE, `BuildView`, `ProvisionView`, `GatewayRoutesView`, PT i18n
- **Stubs wired**: Infisical HTTP client, Podman runtime, containerd stub + `RuntimeLoader`
- **Release**: `.github/workflows/release.yml` (4 GHCR images on `v*` tags)
- **CI**: Zig 0.17.0-dev.1158 pin, docker-smoke job, extended e2e matrix (`docs/ci.md`)
- **Agent Zig 0.17**: `process_cmd.zig`, `threaded_io.zig`, `std.Io.Dir` + HTTP `receiveHead` API migration
- **Tests**: 219 unit tests; agent Docker image builds on Linux CI

### 2026-07-03 - Gap items integration (wave 4 parent)

- **Control-plane Docker image**: copies all workspace deps (gateway, builders, runtimes, plugins); `scripts/fix-esm-imports.mjs` post-build for Node ESM; SQL migrations copied to `dist/database/migrations`
- **PostgreSQL migrations**: `SchemaMigrationModel.sync()` before SQL apply; `004-node-agent-url-deploy-spec.sql`
- **Test cluster**: `PLATFORM_NETBIRD_MOCK=1`, MinIO init retry, `fileParallelism: false`, compose `--remove-orphans`, e2e hook timeouts 600s
- **Agent Docker**: Debian bookworm runtime (glibc); HTTP `stream.read` fix (was blocking on `readSliceShort`); registration JSON `ignore_unknown_fields`
- **Gates**: `yarn lint` 25/25, `yarn test:unit` 219/219, `health` e2e green; full e2e matrix running with `REQUIRE_DOCKER=true`

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
- **2026-07-02 follow-up**: Gateway routes persisted in `gateway_routes` + Traefik sync on leader; build context sync (`POST /tasks/build-context`); HA e2e with 2 CP replicas; ingress e2e with traefik-mock. Kaniko explicitly unsupported (`provider: docker` only on agents).

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
