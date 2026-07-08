---
title: App-of-apps
description: Centralized GitOps catalogs with shared vars, extends, and multi-manifest apply.
---

# App-of-apps

App-of-apps lets you manage **multiple workloads from a single GitOps repository**. One catalog manifest at the repository root declares child apps, shared provisioning variables, and optional `extends` sources. The control plane applies every child manifest in sequence when the GitOps webhook fires.

This pattern is similar to Argo CD app-of-apps: CI/CD only needs access to the **platform GitOps repo**, while product manifests can live in other repositories and be pulled in via `extends`.

## When to use it

| Use app-of-apps when | Use a single manifest when |
|----------------------|----------------------------|
| One repo should drive many apps (platform, metrics, rushpedia, etc.) | You deploy one application only |
| CI should set replicas, image tags, or node counts centrally | All config lives in the product repo |
| Child apps reuse compose from other repos via `extends` | No cross-repo composition is needed |

## Root-level fields

All three fields live at the **root** of the YAML (not under `x-naulite` or any wrapper key).

| Field | Purpose |
|-------|---------|
| `apps` | Catalog of child manifests to apply |
| `vars` | Shared `${VAR}` values for CI and provisioning |
| `extends` | Base the entire catalog (or child) on another compose file or git repo |

See the [Manifest reference](/manifest/) for the full field list.

## Catalog manifest

A catalog is a normal compose YAML with a non-empty `apps` map. The control plane detects it in the GitOps webhook and routes to the app-of-apps apply path instead of a single-manifest apply.

```yaml
name: e7-platform

vars:
  PLATFORM_NODE_AMOUNT: "5"
  VERSION: "2026.07.07"

apps:
  rushpedia:
    path: apps/rushpedia/compose.yaml
  metrics:
    path: apps/metrics/compose.yaml
```

### `apps` schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `<appName>` | object | yes | Key is the catalog entry name (used in apply results and revision audit) |
| `<appName>.path` | string | yes | Path to the child manifest, relative to the checked-out catalog repository |

Rules:

- `apps` must be a non-empty object at the root.
- Child paths are resolved from the webhook checkout directory (`catalogWorkDir`).
- Child manifests are applied **in catalog iteration order** (object key order in the YAML).

## Shared `vars`

`vars` defines operational values injected into child manifests after `extends` resolution.

```yaml
vars:
  PLATFORM_NODE_AMOUNT: "5"
  VERSION: "2026.07.07"
```

### Interpolation syntax

| Syntax | Behavior |
|--------|----------|
| `${VAR}` | Replaced by `vars.VAR`. Throws if missing (strict mode). |
| `${VAR:-default}` | Uses `vars.VAR` when set; otherwise `default`. Never throws. |

Interpolation runs on **string values only** (object keys are not modified). Variable names must match `[A-Z0-9_]+`.

After interpolation, known numeric fields are coerced (for example `deploy.replicas: "5"` becomes `5`) so Zod validation does not fail on string numbers.

### Inheritance

1. Catalog `vars` are resolved first.
2. Each child manifest inherits catalog `vars`.
3. Child-local `vars` override inherited keys.
4. Interpolation runs on the fully merged var map.

Use `vars` for **CI and provisioning knobs** (replicas, image tags, feature flags). Do not put secrets in `vars`; use `secrets` and secret references in services.

## `extends`

`extends` composes manifests from local files or git repositories. It works at two levels.

### Root `extends` (entire file)

Platform extension - not part of the upstream Compose spec. Bases the full manifest on one or more files, then deep-merges the local document on top.

```yaml
name: grafana-stack

extends:
  file: github:someone/stack#main
  credentials:
    from: secret
    secret: github-deploy-key
    kind: ssh

vars:
  REPLICAS: "2"

services:
  grafana:
    deploy:
      replicas: ${REPLICAS}
```

Multiple bases are supported as a list (merged in order, local wins last):

```yaml
extends:
  - file: ./bases/common.yaml
  - file: github:org/shared-stack#main
```

### Service `extends` (Compose semantics)

Each service can use Compose-style `extends` with a git-aware `file`:

```yaml
name: rushpedia

services:
  api:
    extends:
      file: github:techtail/rushpedia#main
      service: api
      credentials:
        from: secret
        secret: github-token
        kind: https
    image: ghcr.io/techtail/rushpedia-api:${VERSION}
    deploy:
      replicas: ${PLATFORM_NODE_AMOUNT}
```

Merge rules for service `extends`:

- Maps (for example `environment`, `labels`) are deep-merged.
- Arrays (for example `ports`, `volumes`) are concatenated.
- Scalars in the child service override the base.

### Git `file` formats

| Format | Example |
|--------|---------|
| Local path | `./compose.yaml`, `../shared/base.yaml` |
| GitHub shorthand | `github:owner/repo#ref` |
| Generic host | `git:host/owner/repo#ref` |
| HTTPS URL | `git+https://gitlab.com/group/project#ref` |
| SSH URL | `git+ssh://git@github.com/owner/repo#ref` |

Optional path after the ref selects a compose file inside the repo:

```
github:owner/repo#main/apps/api/compose.yaml
git:gitlab.com/group/project#v1.2.0/deploy/compose.yaml
```

Default compose path when omitted: `compose.yaml`.

### Private repositories (`credentials`)

Git sources accept an optional `credentials` block:

```yaml
credentials:
  from: secret
  secret: my-git-credential
  key: optional-key-in-secret
  kind: ssh   # or https
```

| Field | Purpose |
|-------|---------|
| `from` | Source type. Only `secret` is supported today. |
| `secret` | Platform secret name resolved by `SecretsService` |
| `key` | Optional key inside the secret payload |
| `kind` | `ssh` (deploy key) or `https` (token in URL) |

Credentials are resolver directives, not runtime secret references inside running containers.

## Resolution order

For each manifest (catalog or child), `ManifestResolver` runs:

1. **Root `extends`** - clone/read base files, deep-merge bases, then merge local root on top.
2. **Service `extends`** - for each service with `extends`, load base service and merge.
3. **`vars` merge** - inherited vars + local `vars`.
4. **Interpolation** - replace `${VAR}` / `${VAR:-default}` in all strings.
5. **Numeric coercion** - coerce fields like `deploy.replicas` to numbers.
6. **Strip meta keys** - remove `extends`, `vars`, and `apps` from the final YAML passed to `ComposeParser`.

Git checkouts are cached per apply run (shared cache across all apps in one catalog).

## Apply flow (GitOps webhook)

```
Repository push
    |
    v
POST /gitops/webhook
    |
    v
checkoutAndMerge (manifestPath + overlayPaths)
    |
    +-- root has non-empty `apps`? --+
    |                                |
   yes                              no
    |                                |
    v                                v
AppOfAppsService.applyCatalog    ApplyService.execute (single manifest)
    |
    v
For each app in `apps` (fail-fast):
  1. Read child YAML from apps/<name>/path
  2. ManifestResolver.resolve (with inherited vars)
  3. ApplyService.execute
    |
    v
recordCatalogRevision (catalog YAML + child_manifests audit)
```

### Fail-fast

If any child app fails to resolve or apply, the catalog run **stops immediately**. Apps listed after the failed entry are not applied. The webhook returns an error.

### Single-manifest compatibility

Manifests without `apps` (or with an empty `apps` map) keep the legacy single-manifest path. Existing repos and `overlayPaths` behavior are unchanged.

## Revision tracking

Catalog applies record a composed GitOps revision:

| Stored field | Content |
|--------------|---------|
| `manifestYaml` | Raw catalog YAML from the webhook checkout |
| `childManifests` | Array of applied children: `appName`, `manifestName`, resolved `manifestYaml`, `extendsSources` |

This supports audit and rollback without requiring child git repositories to stay reachable at rollback time.

## Repository layout

Recommended layout for a platform GitOps repo:

```
platform-gitops/
  compose.yaml              # catalog entrypoint (apps + vars)
  apps/
    rushpedia/
      compose.yaml          # thin child - extends product repo
    metrics/
      compose.yaml
    traefik/
      compose.yaml
  overlays/
    production.compose.yaml # optional - merged by checkoutAndMerge
```

The webhook `manifestPath` (default `compose.yaml`) should point at the catalog file. Use `overlayPaths` for environment overlays (deep-merged before catalog detection), same as single-manifest GitOps.

## Child manifest pattern

Keep child manifests **thin**: declare `extends`, override images/replicas/ingress, and consume catalog `vars`. Avoid duplicating full service definitions in the platform repo.

```yaml
# apps/rushpedia/compose.yaml
name: rushpedia

services:
  api:
    extends:
      file: github:techtail/rushpedia#main
      service: api
    image: ghcr.io/techtail/rushpedia-api:${VERSION}
    deploy:
      replicas: ${PLATFORM_NODE_AMOUNT}

  frontend:
    extends:
      file: github:techtail/rushpedia#main
      service: frontend
    image: ghcr.io/techtail/rushpedia-frontend:${VERSION}
```

## App-of-apps vs overlays

| Mechanism | Scope | When it runs |
|-----------|-------|--------------|
| **Overlays** (`overlayPaths` in webhook) | Deep-merge YAML files in the **same checkout** before apply | During `checkoutAndMerge` |
| **`extends`** | Compose from local path or **external git repo** | During `ManifestResolver` (per manifest) |
| **`apps`** | Apply **multiple manifests** from one webhook | After catalog detection |

Typical production flow:

1. Webhook checks out repo and merges `overlays/production.compose.yaml` into the catalog.
2. Catalog `vars` set `VERSION` and `PLATFORM_NODE_AMOUNT` for the environment.
3. Each child in `apps` resolves its own `extends` from product repos and applies.

## Webhook body

Same schema as single-manifest GitOps:

```json
{
  "repositoryUrl": "https://github.com/org/platform-gitops",
  "branch": "main",
  "commitSha": "abc123",
  "manifestPath": "compose.yaml",
  "overlayPaths": ["overlays/production.compose.yaml"]
}
```

When the merged manifest contains `apps`, the response includes per-app apply results:

```json
{
  "manifestName": "e7-platform",
  "commitSha": "abc123",
  "appliedApps": ["rushpedia", "metrics"],
  "results": {
    "rushpedia": { "manifestName": "rushpedia", "revision": 42 },
    "metrics": { "manifestName": "metrics", "revision": 43 }
  }
}
```

## Examples

Full YAML samples: [Manifest examples - app-of-apps](/guides/manifest-examples/#app-of-apps-catalog-extends--vars).

Field reference: [Manifest reference - app-of-apps](/manifest/#app-of-apps-catalog-and-extends).
