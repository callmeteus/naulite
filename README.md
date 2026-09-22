<div align="center">

<img src="assets/naulite-logo.svg" alt="naulite" width="280" />

**A self-hosted orchestration control plane for Compose-compatible workloads, private agents, GitOps rollouts, and operational automation.**

[![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue.svg)](#)
[![Zig](https://img.shields.io/badge/Agent-Zig-orange.svg)](#)
[![NPM Workspaces](https://img.shields.io/badge/NPM-Workspaces-blue.svg)](#)
[![Vitest](https://img.shields.io/badge/Tested%20with-Vitest-green.svg)](#)

[Get Started](#get-started) • [Features](#features) • [Architecture](#architecture) • [CLI](#cli) • [Development](#development)

</div>

---

## What Is naulite?

naulite lets you run a small self-hosted platform from a control plane plus one or more agents. You describe services with Compose-compatible manifests, the control plane plans the desired state, and agents execute workloads on the nodes where they run.

It is designed for teams that want a lightweight deployment layer with GitOps, private networking, backups, logs, metrics, and container registry flows without a heavyweight orchestration stack.

```text
  [ Developer / GitOps / CLI / UI ]
                 |
                 v
        [ naulite Control Plane ]
                 |
       plan, schedule, audit, route
                 |
        +--------+--------+
        |                 |
        v                 v
 [ naulite Agent ]  [ naulite Agent ]
      Docker             Podman
```

---

## Features

* **Compose-compatible manifests:** Define services, volumes, ingress, networks, backups, build steps, and log rotation with a familiar YAML shape.
* **Control plane API:** Fastify API with OpenAPI, ACL, CSRF-protected admin UI flow, audit logs, GitOps revisions, and leader-only mutating routes.
* **Private agents:** Zig agent binary that registers with the control plane, reports status, and executes runtime, build, backup, and restore tasks.
* **Pluggable runtime layer:** Docker, Podman, and containerd provider packages.
* **Built-in operational stack:** PostgreSQL HA dogfood, Prometheus file discovery, Traefik gateway, NetBird integration, S3-compatible backups, and local container registry storage.
* **GitOps and rollback:** Apply manifests from git, track revisions, and roll back to a previous desired state.
* **Admin dashboard and SDK:** Vue dashboard backed by a BFF, plus `@naulite/sdk` for typed API access.
* **CI security checks:** Trivy image scanning and CycloneDX SBOM artifacts for built images.

---

## Get Started

The bootstrap scripts live in the `callmeteus/naulite` repository and can be executed directly from GitHub raw URLs.

### 1. Install A Control Plane

Use this on the host that will run the control plane dogfood stack. It writes `dogfood/.env`, configures public URLs, and starts the local Docker Compose stack unless `--dry-run` is passed.

```bash
curl -fsSL https://raw.githubusercontent.com/callmeteus/naulite/master/bootstrap/control-plane-install.sh | bash
```

Missing values are prompted on an interactive terminal (public URL, NetBird domain, protocol, management URL, and port). Pass flags to skip prompts:

```bash
curl -fsSL https://raw.githubusercontent.com/callmeteus/naulite/master/bootstrap/control-plane-install.sh | bash -s -- --host https://cp.example.com --netbird-domain vpn.example.com --netbird-http-protocol https --netbird-public-management-url https://vpn.example.com
```

Dry-run mode validates inputs and writes configuration without starting Docker:

```bash
curl -fsSL https://raw.githubusercontent.com/callmeteus/naulite/master/bootstrap/control-plane-install.sh | bash -s -- --host https://cp.example.com --dry-run
```

### 2. Install An Agent

Use this on each worker node. NetBird CLI install is enabled by default on Linux. Missing values are prompted on an interactive terminal.

```bash
curl -fsSL https://raw.githubusercontent.com/callmeteus/naulite/master/bootstrap/agent-install.sh | sudo bash
```

Pass flags to skip prompts:

```bash
curl -fsSL https://raw.githubusercontent.com/callmeteus/naulite/master/bootstrap/agent-install.sh | sudo bash -s -- --host https://cp.example.com --setup-key nb_setup_key_here
```

If the control plane can serve bootstrap metadata, the agent installer fetches the NetBird management URL automatically. Skip NetBird install with `--no-install-netbird`.

### 3. Verify The Cluster

Build or install the CLI, then point it at the control plane:

```bash
export NAULITE_CP_URL=https://cp.example.com
export NAULITE_API_KEY=naulite_api_key_here

naulite cluster status get
naulite cluster nodes get
```

Apply a manifest:

```bash
naulite cluster manifests apply -f manifest.yml
```

---

## Architecture

naulite is organized as a TypeScript/Zig monorepo:

* `packages/control-plane`: Fastify control plane, Sequelize models, migrations, orchestration, admin modules, and REST routes.
* `packages/agent`: Zig agent that runs on worker nodes.
* `packages/cli`: Zig CLI with a Node package wrapper.
* `packages/nodejs/shared`: Schemas, provider contracts, manifest utilities, and permission catalog.
* `packages/nodejs/logger`: Winston logger with log rotation and cross-language format contract.
* `packages/sdk`: Typed HTTP client for the control plane and admin BFF.
* `packages/ui`: Vue admin dashboard plus backend-for-frontend.
* `packages/gateway`: Traefik/NetBird gateway integration.
* `packages/runtimes`: Docker, Podman, and containerd runtime providers.
* `packages/builders`: Docker and Kaniko build providers.
* `packages/plugins`: Optional providers such as S3 storage, Slack, webhook notifications, Infisical, and AWS node provisioning.

---

## CLI

The CLI uses hierarchical resource commands:

```bash
naulite login --cp 100.64.0.10 --key <api-key>
naulite cluster status get
naulite cluster nodes get
naulite cluster services get
naulite cluster manifests apply -f manifest.yml
naulite runs list
naulite runs logs <runId>
```

Environment variables:

```bash
NAULITE_CP_URL=https://cp.example.com
NAULITE_API_KEY=naulite_api_key_here
NAULITE_TOKEN=naulite_api_key_here
```

---

## Development

Clone the repository and run from the repo root:

```bash
yarn install
yarn build
yarn test:unit
```

Local development (control plane, agent, admin UI, docs, Prometheus):

```bash
yarn install
yarn dev
```

`yarn dev` compiles workspace packages as needed. A separate `yarn build` is not required before it.

With Docker available:

```bash
yarn dev:docker
yarn test:unit:docker
yarn test:e2e
```

Common scripts:

* `yarn build` - Build all packages with Turborepo.
* `yarn dev` - Start the local development stack (control plane, agent, admin UI, docs).
* `yarn lint` - Run ESLint across packages.
* `yarn test:unit` - Run unit tests.
* `yarn test:unit:docker` - Run Docker-backed unit tests.
* `yarn test:e2e` - Run end-to-end flows against the local test cluster.
* `yarn dev:docker` - Bootstrap NetBird and start the full Docker dogfood stack.

---

## Documentation

* [CONTEXT.md](CONTEXT.md) - Architecture and product philosophy.
* [ROADMAP.md](ROADMAP.md) - Sandbox de workspace (Incus CoW, bake, checklist).
* [CHANGELOG.md](CHANGELOG.md) - Release and development history.
* [packages/docs/src/content/docs/bootstrap.md](packages/docs/src/content/docs/bootstrap.md) - Bootstrap details.
* [packages/docs/src/content/docs/get-started/install.md](packages/docs/src/content/docs/get-started/install.md) - Installation guide.
* [packages/docs/src/content/docs/operations/runbook.md](packages/docs/src/content/docs/operations/runbook.md) - Operations runbook.

---

## License

License not specified yet.
