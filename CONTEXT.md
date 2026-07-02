# Platform Context

Canonical architecture and philosophy for the distributed orchestration platform monorepo.

## Vision

Users describe desired state in Compose-compatible manifests. The **control plane** parses manifests, plans changes, schedules work, and coordinates cluster state. **Agents** execute plans on nodes via pluggable runtime providers. No Kubernetes concepts are exposed or required.

## Philosophy

1. **User describes** - manifests declare services, networks, volumes, secrets, ingress, backups, and log rotation.
2. **Control plane decides** - parsing, planning, scheduling, secret filtering, and policy evaluation happen only in the control plane.
3. **Agent executes** - agents receive execution plans and maintenance tasks over REST and run them locally.

## What we are not building

Pods, ReplicaSets, DaemonSets, StatefulSets, CRDs, Operators, Admission Controllers, Kubernetes Services, CSI, CNI, kube-proxy, Helm, or gRPC control APIs.

## Package map

| Package | Responsibility |
|---------|----------------|
| `shared` | Zod schemas, domain types, provider interfaces, plugin registry |
| `cli` | Zig CLI (`zig build`); NPM wrapper in `bin/platform.js`; strings in `zig/src/i18n.zig` |
| `sdk` | Typed HTTP client for control plane routes |
| `ui` | Web dashboard; strings in `src/ui/en.json` |
| `control-plane` | Fastify API, database, orchestration, GitOps, schedulers |
| `agent` | Zig executor on each node |
| `runtime-docker`, `runtime-podman`, `runtime-containerd`, `builders`, `gateway`, `volumes`, `secrets`, `registries`, `backups`, `log-rotation` | Core providers |
| `plugin-*` | Swappable extensions (`plugin-s3`, future Azure/GCS/Vault plugins) |

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

- Directory convention: `packages/plugin-<name>/`
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

- Control plane REST API for CLI, UI, GitOps, and agents.
- SQLite for single-node dev; PostgreSQL for HA multi-control-plane deployments.
- Multi-CP sync uses PostgreSQL events and shared state.

## Quality bar

- English-only code and docs in V1
- Unit tests (pure and Docker-backed) plus e2e smoke on `LocalTestCluster`
- CI gates: lint, unit, docker unit, e2e, build

## Related docs

- [Architecture](docs/architecture.md)
- [Manifest reference](docs/manifest.md)
- [Networks](docs/networks.md)
- [Backups](docs/backups.md)
- [Log rotation](docs/log-rotation.md)
- [Bootstrap](docs/bootstrap.md)
- [Development progress](PROGRESS.md)
