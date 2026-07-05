# @naulite/sdk

Typed HTTP client for the Naulite control plane REST API.

See [CONTEXT.md](../../CONTEXT.md) for architecture and [PROGRESS.md](../../PROGRESS.md) for current development status.

## Usage

```typescript
import { NauliteClient } from "@naulite/sdk";

const client = new NauliteClient({ baseUrl: "http://localhost:8080" });
const health = await client.getHealth();
const nodes = await client.listNodes();
```

## API coverage

- Cluster status and resource listing (nodes, services, instances, volumes, secrets, backups)
- Manifest apply and resource delete
- Logs, exec, build, registry, ingress
- Backup and log rotation operations
- GitOps revisions, rollback, and webhook
- NetBird topology, devices, groups, and ACLs
- Prometheus metrics endpoint
