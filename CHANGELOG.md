# Changelog

**Last updated:** 2026-07-05

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
| Production alpha hardening | completed | 2026-07-04 | 2026-07-04 |
| Naulite cutover (docs + branding) | completed | 2026-07-05 | 2026-07-05 |

## Post-alpha backlog

- Physical git folder rename `platform/` to `naulite/` (blocked while the workspace has the directory open; run manually when idle)
- First semver release tag and GHCR publish to `callmeteus/naulite`
- Zig 0.16 leak checker noise on `zig build test` (tests pass)
- Infisical, Kaniko, and containerd runtime production paths
- SLOs and alerting on top of Prometheus
- Full multi-tenant scoping when `NAULITE_MULTI_TENANT=true`
- Rate limiting on the BFF and control plane
- E2E suites in CI (local-only during alpha)

## Feature flags (opt-in, default off)

| Flag | Default | Purpose | Code state |
|------|---------|---------|------------|
| `NAULITE_MULTI_TENANT` | `false` | Tenant isolation for multi-customer clusters (SaaS) | `tenants` table and `TenantScope` exist; routes do not filter by tenant yet. Do not enable in production until a future hardening wave. |
| `NAULITE_API_KEY_ROTATION_ENABLED` | `false` | API key rotation with grace period | `POST /api-keys/:id/rotate` returns `503` when disabled. Enable only when operators accept the rotation workflow. |

## 2026-07-05 - Naulite cutover

- **Branding**: aligned remaining `platform` references in docs, Dockerfiles, dogfood compose, container labels, registry image prefixes, and Traefik dynamic-config paths with the `naulite` product name
- **CLI docs**: `naulite cluster ...` examples, `bin/naulite.js`, and `~/.naulite/credentials.json`
- **Bootstrap docs**: one-liner install commands; NetBird enabled by default on agents; interactive prompts for missing flags
- **Changelog**: replaced `CHANGELOG.md` with this English-only `CHANGELOG.md`
- **Agent image**: Dockerfile installs `naulite-agent` binary and runs as the `naulite` system user
- **Postgres HA defaults**: pgpool and health checks aligned with the `naulite` database user

## 2026-07-04 - Production alpha hardening

- **Docs IA**: Get Started (`install`, `database`, `first-workload`, `tls`); lean Operations (`runbook`, `failover`, `migrations`, `load-chaos`, `aws-provisioner`); manifest examples moved to `guides/manifest-examples.md`
- **Postgres HA**: primary + replica + pgpool in the default compose stack; `DATABASE_URL` via pgpool in the install script; external RDS documented as opt-out
- **Secrets**: `PostgresSecretProvider` as default (`SECRET_BACKEND=postgres`); apply flow and `/secrets` API share the same table
- **TLS**: `NAULITE_TLS_MODE` (ACME TLS/DNS, passthrough, self_signed, custom); Traefik template plus inline certs in dynamic config
- **Agent**: pinned NetBird CLI in Dockerfile; compose hardening (`cap_drop`, non-root); bootstrap installs NetBird by default on Linux
- **CI**: pinned third-party images in dogfood; `image-scan` job with Trivy after `docker-smoke`; CycloneDX SBOM artifacts
- **ACL and sessions**: `resource:action` catalog; control-plane routes with `requirePermission`; `admin_audit_log`; BFF CSRF double-submit and Secure cookies; `/admin/users` routes; email/username mapping in the SDK
- **Notifications**: `notification-webhook` and Slack plugins; UI test ping; multi-provider dispatcher with per-provider event filters
- **AWS provisioner**: leader-only EC2 status polling in `NodeProvisionService`
- **Migrations and chaos**: `/health/ready` gated until migrations apply; `scripts/load/k6-apply.js` and `scripts/chaos/kill-leader.sh`; e2e `chaos-failover.test.ts` and `ingress-tls-self-signed.test.ts`

## 2026-07-03 - Alpha wave: platform hardening (integration complete)

- **Dogfood**: compose, dev scripts, and NetBird/Traefik infra under `dogfood/`; Prometheus file_sd volume shared across both control-plane replicas
- **Agent and CLI**: Zig **0.16.0** stable; Docker runtime under `packages/agent/src/runtime/docker/`; `metrics_exporter.zig`; `scripts/zig-build.mjs` for Windows cache dir
- **Auth**: `admin_users` and `admin_sessions`; BFF login with session cookies; `NAULITE_MULTI_TENANT=false` and `NAULITE_API_KEY_ROTATION_ENABLED=false` by default
- **Pagination**: server-side list APIs (`items`, `total`, `page`, `limit`, `hasMore`) and UI `useServerPagination`
- **Metrics**: `@naulite/metrics` package; `MetricsSyncService` file_sd; PromQL proxy routes; `MetricsView` (uPlot)
- **UI**: build SSE, provision stepper/history/terminate, `AdminUsersView`, role guards
- **Docs**: `@naulite/docs` Astro + Starlight site; `alpha-scope.md`, operations runbook and metrics guides
- **CI**: e2e removed from `ci.yml` (local only); Zig 0.16.0 pin in `infra/zig-toolchain.env`
- **Dispatch fix**: Docker chunked HTTP body parsing in `docker_api.zig` (was causing `dispatch.status=failed`)
- **Gates**: `yarn lint` 25/25, `yarn test:unit` 254/254, `yarn build` green

## 2026-07-03 - Alpha wave: CI scope (draft)

- **CI scope**: removed `yarn test:e2e` from the `verify` job; e2e remains local-only (`docs/ci.md`)
- **Zig pin**: `0.16.0` in `infra/zig-toolchain.env` and `.github/workflows/ci.yml` (down from 0.17 dev)
- **Docs**: `docs/ci.md` stub points to `packages/docs` for canonical CI docs after integration

## 2026-07-02 - Gap items 1-6, 8-13 (integration)

- **Build to CR to deploy**: `container-registry://` refs, agent `PUT/GET /cr`, `build-cr-deploy` e2e
- **S3 backup/restore**: `BackupRestoreService`, agent staging, MinIO fixture, `backup-restore-s3` e2e
- **Volume teardown**: `removeVolume` op end-to-end (planner, apply, agent Zig, Docker runtime)
- **Traefik and ACME**: real Traefik v3.3 in the test cluster, `infra/traefik/`, ingress HTTP e2e
- **HA failover**: `ha-failover-apply` e2e with leader kill mid-apply
- **Pipeline runs**: BFF `/runs/*`, agent `logText`, `BuildService` step transitions, `build-pipeline-runs` e2e
- **UX**: `RunsView` logs/SSE, `BuildView`, `ProvisionView`, `GatewayRoutesView`, Portuguese i18n
- **Stubs wired**: Infisical HTTP client, Podman runtime, containerd stub and `RuntimeLoader`
- **Release**: `.github/workflows/release.yml` (four GHCR images on `v*` tags)
- **CI**: Zig 0.17.0-dev pin, docker-smoke job, extended e2e matrix (`docs/ci.md`)
- **Agent Zig 0.17**: `process_cmd.zig`, `threaded_io.zig`, `std.Io.Dir` and HTTP `receiveHead` API migration
- **Tests**: 219 unit tests; agent Docker image builds on Linux CI

## 2026-07-03 - Gap items integration (wave 4 parent)

- **Control-plane Docker image**: copies all workspace deps (gateway, builders, runtimes, plugins); `scripts/fix-esm-imports.mjs` post-build for Node ESM; SQL migrations copied to `dist/database/migrations`
- **PostgreSQL migrations**: `SchemaMigrationModel.sync()` before SQL apply; `004-node-agent-url-deploy-spec.sql`
- **Test cluster**: `NAULITE_NETBIRD_MOCK=1`, MinIO init retry, `fileParallelism: false`, compose `--remove-orphans`, e2e hook timeouts 600s
- **Agent Docker**: Debian bookworm runtime (glibc); HTTP `stream.read` fix; registration JSON `ignore_unknown_fields`
- **Gates**: `yarn lint` 25/25, `yarn test:unit` 219/219, `health` e2e green

## 2026-07-02 - p3-ux-quality partial (BFF, SDK, CR UI)

- **BFF routes** (`@naulite/ui-backend`): `POST /build`, `GET /cr/images`, `DELETE /cr/images/:name/:tag`, `POST /nodes/provision` proxied via `app.controlPlane`
- **SDK** (`@naulite/sdk`): `triggerBuild()`, `provisionNode()`; CR methods already present
- **UI**: `ContainerRegistryView.vue` lists images from BFF; nav link at `/container-registry`
- **Tests**: 183 unit tests; new BFF route tests and SDK coverage for build/provision
- **Gateway routes**: persisted in `gateway_routes` with Traefik sync on leader; build context sync (`POST /tasks/build-context`); HA e2e with two CP replicas; ingress e2e with traefik-mock. Kaniko explicitly unsupported (`provider: docker` only on agents).

## 2026-07-02 - Agent and control plane bootstrap

- Agent persists identity in `agent.json` (`/var/lib/naulite/agent.json` or `%ProgramData%\naulite\agent.json`)
- Control plane public bootstrap routes: `GET /bootstrap/agent` (setup-key auth), `GET /bootstrap/setup-key` (loopback)
- `POST /nodes/register` remains the only remote write path required for agent enrollment
- Bootstrap scripts: `bootstrap/control-plane-install.{sh,ps1}` and `bootstrap/agent-install.{sh,ps1}`
- Naulite docs standardized to English (`zig-guidelines.md`, `admin-auth.md`, `bootstrap.md`)

## 2026-07-02 - V1 implementation complete

- Monorepo foundation: 17 packages, Turbo workspaces, shared ESLint/TSConfig, CI workflow
- `@naulite/shared`: Zod schemas, provider interfaces, `PluginRegistry`, `NetworkGroupId`
- `@naulite/control-plane`: Fastify REST, Sequelize (SQLite dev and PostgreSQL HA), planner, scheduler, GitOps, NetBird self-hosted
- `@naulite/agent` (Zig): Docker Engine API executor, CP register/heartbeat, instance status callbacks
- Dogfood compose uses the Zig agent image (`packages/agent/Dockerfile`)
- Providers: runtimes, builders, gateway, S3 storage plugin; local backup/secrets/volumes/log-rotation in control-plane modules
- `@naulite/cli` and `@naulite/sdk`: hierarchical resource commands via typed HTTP client
- `@naulite/ui-frontend` and `@naulite/ui-backend`: Vue 3 dashboard and Fastify admin BFF
- Tests: 183 unit tests, e2e harness with real control plane and Zig agent (`LocalTestCluster`)
- Dogfood: `docker-compose.yml` with HA control plane, Postgres, MinIO, UI, NetBird, and `agent-1`

## 2026-07-02 - Monorepo foundation scaffold

- Created `packages/shared`, `packages/sdk`, `packages/cli`, and `packages/ui`
- Added `tests/harness/LocalTestCluster`, docker compose fixtures, unit tests, and e2e health smoke
- Added `CONTEXT.md`, root `README.md`, legacy `docs/*` redirects, and GitHub Actions CI workflow
