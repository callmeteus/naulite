# Manifest reference
  
Platform manifests are Compose YAML files with platform-specific extensions parsed only by the control plane.
  
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
  
## Service extensions
  
| Field | Purpose |
|-------|---------|
| `cluster.labels` | Node label selector for scheduling |
| `capabilities` | Required node capabilities |
| `buildOptions` | Builder provider and build node selection |
| `ingress` | Public hostnames and TLS configuration |
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
  
See `tests/fixtures/manifests/minimal.compose.yml` for the repository copy.
  
## Apply contract
  
`POST /apply` accepts raw YAML. The control plane validates, persists desired state, plans changes, and dispatches execution plans to agents.
