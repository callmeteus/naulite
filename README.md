# Platform

Distributed orchestration platform for Compose-compatible workloads. Users describe desired state in manifests; the control plane plans and schedules; agents execute on nodes.

## Repository root

This directory (`platform/`) is the **git repository root** and the working directory for all development. Clone the repo, run `yarn install`, `yarn build`, tests, and Docker dogfood from here - not from the parent `Hytale/` workspace folder.

## V1 status

V1 is a **working scaffold**, not a production-ready product:

- **Implemented:** manifest apply, orchestration (parser/planner/scheduler), Zig agents, Sequelize-backed control plane, CLI, Vue dashboard, GitOps, backups, log rotation, NetBird integration, and a full Docker Compose dogfood stack.
- **Intended use:** local development, integration testing, and internal dogfood.
- **Not yet production-hardened:** operational runbooks, multi-tenant hardening, and production SLOs are follow-up work beyond this scaffold.

See [PROGRESS.md](PROGRESS.md) for the phase log and [CONTEXT.md](CONTEXT.md) for architecture.

## Features

- Compose-based manifests with platform extensions (cluster labels, ingress, backups, log rotation, networks)
- Pluggable providers for runtime, builds, gateway, secrets, volumes, and backup destinations
- kubectl-style CLI and Vue dashboard
- HA control plane with SQLite or PostgreSQL (Sequelize ORM)
- NetBird integration for private networking and ingress (self-hosted only; see `docs/netbird.md`)
- GitOps apply and rollback

## Quick start

```bash
yarn install
yarn build
yarn test:unit
```

With Docker available:

```bash
# Linux/macOS/Git Bash
./bin/dev.sh

# Windows PowerShell
./bin/dev.ps1

# Or via yarn (picks script by OS)
yarn dev:docker
```

This creates `.env` when missing, bootstraps NetBird config under `infra/netbird/`, runs `docker compose up -d --build`, and creates `ADMIN_API_KEY` when empty.

```bash
yarn test:unit:docker
yarn test:e2e
```

Point the CLI or UI at a control plane:

```bash
export NAULITE_CP_URL=http://localhost:8080
yarn workspace @naulite/cli build:all
platform cluster status get
```

## Repository layout

```
platform/                  # git + dev root (you are here)
    packages/
        shared/            Domain schemas and provider interfaces
        cli/               Zig CLI; strings in src/i18n.zig
        sdk/               Control plane HTTP client
        ui/                Vue dashboard (ui-frontend + ui-backend BFF)
        control-plane/     Fastify API, Sequelize, orchestration
        agent/             Zig executor on each node
        runtimes/          Docker, Podman, containerd providers
        builders/          Docker and Kaniko build providers
        plugins/           Swappable extensions (e.g. s3-storage-provider)
        gateway/           Ingress gateway provider
    tests/
        unit/              Pure and docker-backed unit tests (~72)
        e2e/               Black-box platform flows
        harness/           LocalTestCluster lifecycle helpers
        fixtures/          Docker compose stack and manifests
    docs/                  Architecture and operations guides
```

## Documentation

- [CONTEXT.md](CONTEXT.md) - canonical architecture and philosophy
- [PROGRESS.md](PROGRESS.md) - development log and phase status
- [docs/ci.md](docs/ci.md) - CI requirements and local parity
- [docs/architecture.md](docs/architecture.md)
- [docs/manifest.md](docs/manifest.md)
- [docs/networks.md](docs/networks.md)
- [docs/backups.md](docs/backups.md)
- [docs/log-rotation.md](docs/log-rotation.md)
- [docs/bootstrap.md](docs/bootstrap.md)
- [docs/admin-auth.md](docs/admin-auth.md)

## Development

| Script | Description |
|--------|-------------|
| `yarn build` | Build all packages via Turborepo |
| `yarn lint` | ESLint across packages |
| `yarn test:unit` | Fast pure unit tests (~72) |
| `yarn test:unit:docker` | Docker-backed unit tests |
| `yarn test:e2e` | End-to-end smoke and flows |
| `yarn dev` | Start package dev servers in parallel |
| `yarn dev:docker` | Bootstrap NetBird + start full Docker stack (`bin/dev.sh` / `bin/dev.ps1`) |

## License

Private monorepo - internal use.
