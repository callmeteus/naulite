# Continuous integration

GitHub Actions workflow: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

## Jobs

| Job | Purpose |
|-----|---------|
| `verify` | Lint, unit tests, Docker-backed tests, e2e, TypeScript build, Zig agent/CLI |
| `docker-smoke` | `docker build` for release images (no registry push) |

## Host requirements

The `verify` job runs on `ubuntu-latest` with:

- **Node.js 22** and Yarn (`yarn install --frozen-lockfile`)
- **Docker** (GitHub-hosted runners include the daemon)
- **Zig** `0.17.0-dev.1158+1d1193aa7` (pinned in `infra/zig-toolchain.env`, CI env, and `packages/agent/Dockerfile`)

Set `REQUIRE_DOCKER=true` in CI so Docker-backed unit tests and all e2e suites fail instead of skipping when the daemon is unreachable.

## E2E test cluster

E2e tests use [`tests/harness/LocalTestCluster.ts`](../tests/harness/LocalTestCluster.ts), which starts:

```bash
docker compose -f tests/fixtures/docker-compose.test-cluster.yml -p platform-test-cluster --profile real up -d --build
```

By default CI uses the **real** Traefik profile (Postgres, MinIO, Traefik, dynamic config store, HA control plane replicas, Zig agents). Do not set `TRAEFIK_USE_MOCK=true` in CI unless you intentionally want the lightweight mock profile.

Each e2e file boots its own cluster in `beforeAll`. Bootstrap includes image builds and MinIO bucket init, so the e2e step has a **45 minute** workflow timeout and Vitest hook timeouts of **6 minutes** (see `vitest.e2e.config.ts`).

## Running locally (parity with CI)

```bash
yarn install --frozen-lockfile
yarn lint
yarn test:unit
REQUIRE_DOCKER=true yarn test:unit:docker
REQUIRE_DOCKER=true yarn test:e2e
yarn build
```

Zig (match pinned version):

```bash
# Install Zig 0.17.0-dev.1158+1d1193aa7 (see infra/zig-toolchain.env), then:
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
| `verify` job | 60 min | Full lint + unit + docker unit + e2e + build |
| E2E step | 45 min | Multiple cluster bootstraps with MinIO and Traefik |
| Vitest `hookTimeout` | 360 s | `docker compose up --build` in `beforeAll` |
| Vitest `testTimeout` | 240 s | Apply, backup, ingress, and HA flows |

## Zig version alignment

Single pin: **`0.17.0-dev.1158+1d1193aa7`** in:

- `infra/zig-toolchain.env`
- `.github/workflows/ci.yml` (`env.ZIG_VERSION`)
- `packages/agent/Dockerfile` (`ARG ZIG_VERSION`)

Agent sources use Zig 0.17 APIs (`std.Io`, etc.). CI and release images must use the same toolchain so local, CI, and container builds stay consistent.
