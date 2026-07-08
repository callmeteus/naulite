---
title: Manifest reference
description: Compose YAML with naulite-specific extensions.
---

# Manifest reference

Naulite manifests are Compose YAML files with naulite-specific extensions parsed only by the control plane.

## Top-level fields

| Field | Purpose |
|-------|---------|
| `name` | Application identifier used for NetBird groups and cluster scoping |
| `services` | Standard Compose services plus platform keys |
| `volumes` | Cluster volume definitions with backup policies |
| `networks` | Compose networks with optional `local: true` |
| `secrets` | Secret metadata and references |
| `registries` | Registry authentication declarations |
| `defaults` | File-level defaults for services |
| `vars` | Platform-only variables for `${VAR}` interpolation (CI/provisioning knobs) |
| `apps` | App-of-apps catalog - map of child apps to local manifest paths |
| `extends` | Platform-only root-level extends to base an entire manifest on another file/repo |

## Service extensions

| Field | Purpose |
|-------|---------|
| `cluster.labels` | Node label selector for scheduling |
| `capabilities` | Required node capabilities |
| `build` | Build context, output image, provider, and builder node selection (mutually exclusive with `image`) |
| `ingress` | Public hostnames and TLS configuration |
| `function` | Ephemeral server function: timeout and triggers (API, CLI, cron, HTTP ingress) |
| `logRotation` | Scheduled log rotation policy |
| `environment` secret refs | Structured secret key references |

## Volume extensions

| Field | Purpose |
|-------|---------|
| `strategy` | Volume placement strategy |
| `backup` | Schedule, includes, excludes, retention, destination |

## Minimal example

```yaml
name: minimal

services:
    web:
        image: nginx:1.27-alpine
        ports:
            - "8080:80"
        restart: unless-stopped
```

See [Manifest examples](/guides/manifest-examples/) for minimal, multi-service, overlay, and game-server samples.

## Server functions (`function:`)

A service with `function:` runs as a **one-shot container** on demand instead of keeping replicas running.

```yaml
services:
  hello:
    image: alpine:latest
    command: ["sh", "-lc", "echo hello"]
    function:
      timeout: 30s
      trigger:
        http: true
        cron: "0 3 * * *"
```

- `deploy.replicas` is invalid when `function` is set.
- `timeout` accepts `30s`, `1m`, `5m`, `2h` (default `60s`, max 15m).
- `trigger.http` enables API, CLI, and HTTP ingress invoke.
- `trigger.cron` schedules leader-side cron invocations.

Full trigger matrix, API routes, CLI, and ingress behavior: [Server functions](/guides/server-functions/).

## Apply contract

`POST /apply` accepts raw YAML. The control plane validates, persists desired state, plans changes, and dispatches execution plans to agents.

## App-of-apps (catalog) and `extends`

Platform-only root fields for centralized GitOps:

| Field | Summary |
|-------|---------|
| `apps` | Catalog of child manifests (`path` per entry). Webhook applies all children sequentially (fail-fast). |
| `vars` | Shared `${VAR}` / `${VAR:-default}` interpolation for CI and provisioning (replicas, tags). Not for secrets. |
| `extends` | Root: deep-merge entire file from local path or git. Service: Compose `extends` with git-aware `file`. |

Minimal catalog:

```yaml
name: e7-platform
vars:
  VERSION: "2026.07.07"
apps:
  rushpedia:
    path: apps/rushpedia/compose.yaml
```

Full guide (resolution order, git credentials, webhook flow, revision audit): [App-of-apps](/guides/app-of-apps/).
