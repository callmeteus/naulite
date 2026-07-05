# Naulite Context

Canonical architecture and philosophy for the distributed orchestration platform monorepo.

## Vision

Users describe desired state in Compose-compatible manifests. The **control plane** parses manifests, plans changes, schedules work, and coordinates cluster state. **Agents** execute plans on nodes via pluggable runtime providers. The platform stays Compose-native instead of exposing cluster orchestration primitives.

## Philosophy

1. **User describes** - manifests declare services, networks, volumes, secrets, ingress, backups, and log rotation.
2. **Control plane decides** - parsing, planning, scheduling, secret filtering, and policy evaluation happen only in the control plane.
3. **Agent executes** - agents receive execution plans and maintenance tasks over REST and run them locally.

## What we are not building

Low-level orchestration primitives, custom resource APIs, operator frameworks, admission webhooks, or gRPC control APIs.

## Package map

| Package | Responsibility |
|---------|----------------|
| `shared` | Zod schemas, domain types, provider interfaces, plugin registry |
| `cli` | Zig CLI (`zig build`); NPM wrapper in `bin/platform.js`; strings in `src/i18n.zig` |
| `sdk` | Typed HTTP client for control plane routes |
| `ui` | Web dashboard (`ui-frontend` + `ui-backend` BFF); cluster state via Vue `reactive()` (`stores/Cluster.ts`); strings in `packages/ui/packages/frontend/src/ui/en.json` |
| `control-plane` | Fastify API, Sequelize ORM (`sequelize-typescript`), orchestration, GitOps, schedulers |
| `agent` | Zig executor on each node |
| `runtime-docker`, `runtime-podman`, `runtime-containerd` | Under `packages/runtimes/*` - container runtime providers |
| `builders/docker`, `builders/kaniko` | Dedicated builder plugins extending `BuilderProvider` |
| `plugins/s3` | Backup destination plugins (e.g. S3); future: `plugins/infisical-secret-provider` |
| `gateway` | Ingress gateway provider (Traefik + NetBird) |
| `control-plane` modules | Local providers: `src/modules/backup`, `log-rotation`, `secrets`, `volumes` |
| `plugins/*` | Swappable extensions (`plugins/s3`, future `plugins/infisical-secret-provider`, etc.) |

## Manifest model

Manifests are Compose YAML with platform extensions:

- `cluster` for node label selection
- `capabilities` for feature requirements
- `buildOptions` for image builds
- `ingress` for public routing and TLS
- top-level `networks` with auto-generated NetBird groups
- `backup` on volumes
- `logRotation` on services
- `registries`, `defaults`, and structured secret references

Only the control plane parses manifests.

## Agent boundaries

Agents expose health, metrics, logs, exec, execution plan application, backup tasks, log rotation tasks, and peer backup receive endpoints. Agents do not parse manifests or make scheduling decisions.

## Provider plugin model

- Directory convention: `packages/plugins/<name>/` (registry id = directory name, e.g. `s3`)
- Registered id: `<name>` without the `plugin-` prefix
- Auto-discovery in the control plane; no central import list

## Bootstrap

One-command install scripts bootstrap Docker (without sudo where possible), NetBird, the agent service, and control plane registration. See `docs/bootstrap.md`.

## Networks and NetBird

Non-local networks auto-generate NetBird groups as `${manifest.name}-${networkKey}`. `local: true` networks stay on-node Docker bridges only. Internal services without ingress can be exposed NetBird-only. NetBird must be self-hosted - see `docs/netbird.md`.

## Secrets, volumes, builds, registries

- Secrets are encrypted at rest and filtered before agent delivery.
- Volumes are cluster-scoped metadata with local or replicated strategies.
- Builds use Docker or Kaniko via builder providers.
- Registries are declared in manifests and resolved at deploy time.

## Backups and log rotation

- Volume backups support schedules, includes/excludes, retention, and destinations (`local`, `node`, `s3`, plugins).
- Log rotation policies run on agents with rotate/compress rules.

See `docs/backups.md` and `docs/log-rotation.md`.

## Communication and database

- Control plane REST API for CLI, agents, GitOps, and the admin BFF.
- Sequelize ORM with SQLite for single-node dev; PostgreSQL for HA multi-control-plane deployments.
- Multi-CP sync uses PostgreSQL events and shared state.

## Quality bar

- English-only code and docs in V1
- ~72 unit tests (pure and Docker-backed) plus e2e smoke on `LocalTestCluster`
- CI gates: lint, unit, docker unit, e2e, build

## Related docs

- [Architecture](docs/architecture.md)
- [Zig code guidelines](docs/zig-guidelines.md)
- [Manifest reference](docs/manifest.md)
- [Networks](docs/networks.md)
- [Backups](docs/backups.md)
- [Log rotation](docs/log-rotation.md)
- [Bootstrap](docs/bootstrap.md)
- [Admin authentication](docs/admin-auth.md)
- [Development progress](PROGRESS.md)
