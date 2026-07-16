# @naulite/sdk

Typed HTTP client for the Naulite control plane REST API.

## Overview

`NauliteClient` wraps cluster operations: nodes, services, manifests, logs, exec, builds, GitOps, NetBird topology, and metrics endpoints.

## Run

Use from TypeScript services or scripts after building the workspace:

```bash
yarn workspace @naulite/sdk build
```

## Usage

```typescript
import { NauliteClient } from "@naulite/sdk";

const client = new NauliteClient({ baseUrl: "http://localhost:8080" });
const health = await client.getHealth();
const nodes = await client.listNodes();
```

## API coverage

- Cluster status and resources (nodes, services, instances, volumes, secrets, backups)
- Manifest apply and resource delete
- Logs, exec, build, registry, ingress
- Backup and log rotation
- GitOps revisions, rollback, webhook
- NetBird topology, devices, groups, ACLs
- Prometheus metrics endpoint

See [CONTEXT.md](../../CONTEXT.md) and [CHANGELOG.md](../../CHANGELOG.md) for architecture and release status.

See [../../README.md](../../README.md) for monorepo setup.
