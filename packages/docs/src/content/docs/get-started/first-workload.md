---
title: First workload
description: Apply your first manifest to a Naulite cluster with the CLI.
---

# First workload

After the [control plane and agents are installed](/get-started/install/) and [database connectivity is healthy](/get-started/database/), apply a manifest to schedule your first service.

## Prerequisites

- `NAULITE_CP_URL` set to your control plane base URL
- CLI built: `yarn workspace @naulite/cli build:all`
- At least one agent node `online` in `naulite cluster nodes get`

## Minimal apply

Start with the smallest valid manifest:

```yaml
name: minimal

services:
    web:
        image: nginx:1.27-alpine
        ports:
            - "8080:80"
        restart: unless-stopped
```

Save as `minimal.compose.yml` and apply:

```bash
naulite cluster manifests apply -f minimal.compose.yml
```

## Verify scheduling

```bash
naulite cluster status get
naulite cluster services get
```

The planner assigns services to nodes that satisfy `cluster.labels` and `capabilities` when present. An unlabeled minimal manifest schedules on any online agent with Docker available.

## Richer examples

For full-featured samples (ingress, backups, builds, overlays), see [Manifest examples](/guides/manifest-examples/). The [Manifest reference](/manifest/) documents every platform extension field.

## GitOps and rollback

For webhook-driven apply and revision rollback, see `CONTEXT.md` in the platform repository. The CLI `apply` command is the fastest path for your first manual deployment.

## Troubleshooting

| Symptom | Check |
|---------|-------|
| Apply rejected | Manifest YAML syntax; `name` field present |
| Service pending | Agent online; node labels vs manifest `cluster.labels` |
| Image pull errors | Registry credentials in manifest `registries` section |
| Build stuck | Builder node with `capability: builder` label |

For ongoing incidents, use the [Operations runbook](/operations/runbook/).
