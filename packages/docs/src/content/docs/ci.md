---
title: Continuous integration
description: CI requirements and local parity with GitHub Actions.
---

# Continuous integration

GitHub Actions workflow: `.github/workflows/ci.yml`.

## Jobs

| Job | Purpose |
|-----|---------|
| `verify` | Lint, unit tests, Docker-backed tests, TypeScript build, Zig agent/CLI |
| `docker-smoke` | `docker build` for release images (no registry push) |

## Host requirements

The `verify` job runs on `ubuntu-latest` with:

- **Node.js 22** and Yarn (`yarn install --frozen-lockfile`)
- **Docker** (GitHub-hosted runners include the daemon)
- **Zig** `0.16.0` (pinned in `infra/zig-toolchain.env` and CI env)

Set `REQUIRE_DOCKER=true` in CI so Docker-backed unit tests fail instead of skipping when the daemon is unreachable.

## E2E tests (local development only)

E2E suites are **not** run in CI during the alpha wave. Run them locally before merging high-risk changes:

```bash
REQUIRE_DOCKER=true yarn test:e2e
```

E2e tests use `tests/harness/LocalTestCluster.ts`, which starts:

```bash
docker compose -f tests/fixtures/docker-compose.test-cluster.yml -p naulite-test-cluster --profile real up -d --build
```

By default use the **real** Traefik profile (Postgres, MinIO, Traefik, dynamic config store, HA control plane replicas, Zig agents). Set `TRAEFIK_USE_MOCK=true` only when you intentionally want the lightweight mock profile.

Each e2e file boots its own cluster in `beforeAll`. Bootstrap includes image builds and MinIO bucket init; Vitest hook timeouts are **6 minutes** (see `vitest.e2e.config.ts`).

## Running locally (parity with CI)

```bash
yarn install --frozen-lockfile
yarn lint
yarn test:unit
REQUIRE_DOCKER=true yarn test:unit:docker
yarn build
```

Zig (match pinned version):

```bash
# Install Zig 0.16.0 (see infra/zig-toolchain.env), then:
cd packages/agent && zig build -Doptimize=ReleaseSafe && zig build test
cd packages/cli && zig build
```

Docker image smoke (no push):

```bash
docker build -f packages/agent/Dockerfile .
docker build -f packages/control-plane/Dockerfile .
docker build -f packages/ui/Dockerfile .
docker build -f packages/ui/packages/backend/Dockerfile .
```

## Timeouts

| Layer | Value | Reason |
|-------|-------|--------|
| `verify` job | 60 min | Lint + unit + docker unit + build + Zig |
| Vitest `hookTimeout` (e2e, local) | 360 s | `docker compose up --build` in `beforeAll` |
| Vitest `testTimeout` (e2e, local) | 240 s | Apply, backup, ingress, and HA flows |

## Zig version alignment

Single pin: **`0.16.0`** in:

- `infra/zig-toolchain.env`
- `.github/workflows/ci.yml` (`env.ZIG_VERSION`)

Release images should use the same toolchain once `packages/agent/Dockerfile` is updated during integration.
