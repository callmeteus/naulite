# Networks
  
Platform networks extend Compose networking with automatic NetBird group management.
  
## User-facing model
  
Users declare networks in the manifest `networks` block and attach services with standard Compose `networks:` keys. They do not configure NetBird group names manually.
  
```yaml
name: rushpedia
  
networks:
    internal:
    edge:
    sidecar:
        local: true
```
  
## NetBird requirement

All nodes and the control plane must use a **self-hosted NetBird** instance. Cloud endpoints are rejected at startup.

See [netbird.md](./netbird.md) for environment variables and enrollment flow.

## NetBird group formula
  
For non-local networks:
  
```
groupId = ${manifest.name}-${networkKey}
```
  
Examples:
  
- `rushpedia` + `internal` -> `rushpedia-internal`
- `bookstore` + `app` -> `bookstore-app`
  
Implementation: `NetworkGroupId.generate()` in `@platform/shared`.
  
## Local networks
  
When `local: true`:
  
- Docker bridge network is created on the scheduled node only
- No NetBird group is created or synced
- Use for sidecars and single-node-only traffic
  
## Internal exposure
  
Services that:
  
- join at least one non-local network
- expose a port
- do not define public `ingress`
  
are published NetBird-only by the exposure planner. Public ingress still uses the gateway provider (Traefik via NetBird by default).
  
## Control plane responsibilities
  
On apply for each network:
  
1. Determine whether the network is local-only.
2. Generate the NetBird group id when required.
3. Sync group membership and ACL rules.
4. Instruct agents to create Docker network attachments for scheduled containers.
