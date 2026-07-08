---
title: Manifest examples
description: Reference Compose manifests with platform extensions for common deployment patterns.
---

# Manifest examples

These samples were previously under `platform/examples/manifests/`. Use them as starting points for `naulite cluster manifests apply` or GitOps repositories.

## function-invoke.compose.yml

Ephemeral server function with HTTP trigger (no long-running replicas):

```yaml
name: function-invoke

services:
  hello:
    image: alpine:latest
    command: ["sh", "-lc", "echo hello-from-function"]
    function:
      timeout: 30s
      trigger:
        http: true
```

Invoke after apply:

```bash
naulite cluster functions invoke hello
```

See [Server functions](/guides/server-functions/) for cron, ingress, API, and run history.

## minimal.compose.yml

Smallest valid manifest - single nginx service:

```yaml
name: minimal

services:
    web:
        image: nginx:1.27-alpine
        ports:
            - "8080:80"
        restart: unless-stopped
```

## base.compose.yml

Multi-service app with builds, ingress, registry auth, and a database volume:

```yaml
name: rushpedia
  
registries:
    default: ghcr
    entries:
        ghcr:
            url: ghcr.io
            credentialsSecret: ghcr-pull
  
networks:
    internal:
    edge:
    database:
  
services:
    backend:
        build:
            context: ./packages/backend
            image: ghcr.io/techtail/rushpedia-backend:${VERSION}
            provider: docker
        restart: unless-stopped
        networks:
            - internal
        expose:
            - "3000"
        logRotation:
            schedule: "0 2 * * *"
            paths:
                - /app/logs/*.log
            maxSizeMb: 100
            maxFiles: 10
            compress: true
        environment:
            NODE_ENV: production
            DB_HOST: postgres
        depends_on:
            - postgres
  
    frontend:
        build:
            context: ./packages/frontend
            image: ghcr.io/techtail/rushpedia-frontend:${VERSION}
        restart: unless-stopped
        networks:
            - edge
            - internal
        ingress:
            enabled: true
            hosts:
                - rushpedia.example.com
                - www.rushpedia.example.com
            tls: true
  
    postgres:
        image: postgres:16-alpine
        restart: unless-stopped
        networks:
            - database
        volumes:
            - pgdata:/var/lib/postgresql/data
  
volumes:
    pgdata:
        strategy: local
        access: readWriteOnce
        size: 10Gi
```

## app-with-db.compose.yml

Bookstore stack with secret refs, S3 and node backups, Kaniko builds, and health checks:

```yaml
name: bookstore
  
volumes:
    postgres-data:
        strategy: local
        access: readWriteOnce
        size: 20Gi
        backup:
            schedule: "0 3 * * *"
            includes:
                - "pgdata/**"
                - "**/*.conf"
            excludes:
                - "pgdata/pg_wal/**"
                - "**/*.tmp"
            retention:
                maxCount: 14
                maxAgeDays: 90
            destination:
                provider: s3
                bucket: prod-backups
                prefix: bookstore/postgres/
                region: us-east-1
                credentialsSecret: backup-s3-creds
  
    uploads:
        strategy: local
        access: readWriteOnce
        size: 50Gi
        backup:
            schedule: "0 4 * * 0"
            includes:
                - "**/*"
            excludes:
                - "**/cache/**"
            retention:
                maxCount: 4
            destination:
                provider: node
                nodeId: storage-node-01
                path: /mnt/backups/bookstore-uploads
  
    redis-data:
        strategy: local
        access: readWriteOnce
  
registries:
    default: ghcr
    entries:
        ghcr:
            url: ghcr.io
            credentialsSecret: ghcr-pull
  
networks:
    edge:
    app:
    data:
    metrics-local:
        local: true
  
services:
    postgres:
        image: postgres:16-alpine
        restart: unless-stopped
        networks:
            - data
        environment:
            POSTGRES_DB: bookstore
            POSTGRES_USER: bookstore
            POSTGRES_PASSWORD:
                secret: postgres-credentials
                key: password
        volumes:
            - postgres-data:/var/lib/postgresql/data
        cluster:
            labels:
                role: database
        capabilities:
            - storage
        healthcheck:
            test: ["CMD-SHELL", "pg_isready -U bookstore"]
            interval: 10s
            timeout: 5s
            retries: 5
  
    api:
        build:
            context: ./api
            dockerfile: Dockerfile
            image: ghcr.io/acme/bookstore-api:${GIT_SHA:-latest}
            provider: docker
            cluster:
                labels:
                    capability: builder
        restart: unless-stopped
        networks:
            - edge
            - app
        depends_on:
            postgres:
                condition: service_healthy
            redis:
                condition: service_started
        environment:
            DATABASE_URL:
                secret: postgres-credentials
                key: databaseUrl
            JWT_SECRET:
                secret: api-secrets
                key: jwt
        volumes:
            - uploads:/app/uploads
        logRotation:
            schedule: "0 0 * * *"
            paths:
                - /app/logs/*.log
            maxSizeMb: 200
            maxFiles: 14
            compress: true
            excludes:
                - "**/*.gz"
        cluster:
            labels:
                role: app
        ingress:
            enabled: true
            hosts:
                - api.bookstore.example.com
            tls:
                certificateSecret: bookstore-api-tls
                privateKeySecret: bookstore-api-tls
  
    redis:
        image: redis:7-alpine
        restart: unless-stopped
        networks:
            - data
        command: ["redis-server", "--appendonly", "yes"]
        volumes:
            - redis-data:/data
        cluster:
            labels:
                role: cache
  
    worker:
        build:
            context: ./worker
            image: ghcr.io/acme/bookstore-worker:${GIT_SHA:-latest}
            provider: kaniko
            cluster:
                labels:
                    capability: builder
            registry: ghcr
        restart: unless-stopped
        networks:
            - app
        depends_on:
            - api
            - redis
        environment:
            REDIS_URL: redis://redis:6379
        cluster:
            labels:
                role: worker
        logRotation:
            schedule: "0 */6 * * *"
            paths:
                - /var/log/worker/*.log
            maxSizeMb: 50
            maxFiles: 5
            compress: true
```

## with-defaults.compose.yml

File-level `defaults` for log rotation, cluster labels, and restart policy:

```yaml
name: internal-tools
  
defaults:
    logRotation:
        schedule: "0 1 * * *"
        maxSizeMb: 100
        maxFiles: 7
        compress: true
    cluster:
        labels:
            tenant: internal
    restart: unless-stopped
  
networks:
    monitoring:
    ops:
    sidecar-local:
        local: true
  
volumes:
    shared-certs:
        strategy: local
        access: readOnlyMany
        backup:
            schedule: "0 0 1 * *"
            includes:
                - "**/*.pem"
                - "**/*.crt"
            destination:
                provider: s3
                bucket: internal-backups
                prefix: certs/
                region: us-east-1
                credentialsSecret: backup-s3-creds
  
    grafana-data:
        strategy: local
    prometheus-data:
        strategy: local
  
services:
    grafana:
        image: grafana/grafana:11.4.0
        networks:
            - monitoring
            - ops
        volumes:
            - grafana-data:/var/lib/grafana
            - shared-certs:/etc/ssl/certs:ro
        ingress:
            enabled: true
            hosts:
                - grafana.internal.example.com
            tls:
                certificateSecret: grafana-internal-tls
                privateKeySecret: grafana-internal-tls
  
    prometheus:
        image: prom/prometheus:v3.1.0
        networks:
            - monitoring
        expose:
            - "9090"
        volumes:
            - prometheus-data:/prometheus
        logRotation:
            schedule: "0 */4 * * *"
            paths:
                - /prometheus/logs/*.log
            maxSizeMb: 250
            maxFiles: 10
            compress: true
```

## minecraft.compose.yml

Game server with region labels, large volume backups to S3, and health checks:

```yaml
name: minecraft
  
networks:
    game:
  
services:
    minecraft:
        image: itzg/minecraft-server:latest
        restart: unless-stopped
        networks:
            - game
        ports:
            - "25565:25565"
        environment:
            EULA: "TRUE"
            MEMORY: 4G
            TYPE: PAPER
        volumes:
            - world-data:/data
        cluster:
            labels:
                role: game
                region: sa-east-1
        capabilities:
            - runtime
        logRotation:
            schedule: "0 */12 * * *"
            paths:
                - /data/logs/*.log
                - /data/crash-reports/*.txt
            maxSizeMb: 500
            maxFiles: 20
            compress: true
        healthcheck:
            test: ["CMD", "mc-health"]
            interval: 30s
            timeout: 10s
            retries: 3
  
volumes:
    world-data:
        strategy: local
        access: readWriteOnce
        size: 100Gi
        backup:
            schedule: "0 */4 * * *"
            includes:
                - "world/**"
                - "paper.yml"
                - "server.properties"
            excludes:
                - "world/playerdata/*.dat_old"
                - "**/cache/**"
            retention:
                maxCount: 42
                maxAgeDays: 14
            destination:
                provider: s3
                bucket: game-backups
                prefix: minecraft/worlds/
                region: sa-east-1
                endpoint: https://s3.sa-east-1.amazonaws.com
                credentialsSecret: backup-s3-creds
```

## overlays/production.compose.yml

Production overlay merged on top of `base.compose.yml` by GitOps (deep merge):

```yaml
name: rushpedia
  
services:
    backend:
        cluster:
            labels:
                env: production
        capabilities:
            - runtime
  
    frontend:
        ingress:
            tls:
                certificateSecret: rushpedia-prod-tls
                privateKeySecret: rushpedia-prod-tls
  
    postgres:
        cluster:
            labels:
                role: database
                env: production
  
volumes:
    pgdata:
        backup:
            schedule: "0 1 * * *"
            includes:
                - "pgdata/**"
            excludes:
                - "pgdata/pg_wal/**"
            retention:
                maxCount: 30
                maxAgeDays: 365
            destination:
                provider: s3
                bucket: techtail-prod-backups
                prefix: rushpedia/pgdata/
                region: sa-east-1
                credentialsSecret: backup-s3-creds
```

## overlays/staging.compose.yml

Staging overlay merged on top of `base.compose.yml`:

```yaml
# Merged on top of base by CP GitOps (deep merge)
name: rushpedia
  
services:
    backend:
        environment:
            NODE_ENV: staging
            LOG_LEVEL: debug
  
    frontend:
        ingress:
            enabled: true
            hosts:
                - staging.rushpedia.example.com
            tls: true
  
volumes:
    pgdata:
        backup:
            schedule: "0 5 * * *"
            includes:
                - "**/*"
            retention:
                maxCount: 3
            destination:
                provider: local
                path: /var/backups/staging/pgdata
```

## Apply

```bash
naulite cluster manifests apply -f minimal.compose.yml
```

See the [Manifest reference](/manifest/) for field documentation and [First workload](/get-started/first-workload/) for a step-by-step first apply.

## App-of-apps catalog (extends + vars) {#app-of-apps-catalog-extends--vars}

GitOps catalog that applies multiple apps from a single repository. See the [App-of-apps guide](/guides/app-of-apps/) for resolution order, fail-fast behavior, and webhook flow.

### `compose.yaml` (catalog entrypoint)

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

### `apps/rushpedia/compose.yaml` (service extends from git)

Thin child manifest - pulls service definitions from the product repo and overrides provisioning with catalog `vars`:

```yaml
name: rushpedia

services:
  api:
    extends:
      file: github:techtail/rushpedia#main
      service: api
      credentials:
        from: secret
        secret: github-deploy-key
        kind: ssh
    image: ghcr.io/techtail/rushpedia-api:${VERSION}
    deploy:
      replicas: ${PLATFORM_NODE_AMOUNT}

  frontend:
    extends:
      file: github:techtail/rushpedia#main
      service: frontend
    image: ghcr.io/techtail/rushpedia-frontend:${VERSION}
```

### `apps/metrics/compose.yaml` (root extends from git)

Child manifest that bases the entire file on a shared stack repo:

```yaml
name: metrics

extends:
  file: github:org/observability-stack#main/metrics/compose.yaml

vars:
  RETENTION_DAYS: "30"

services:
  prometheus:
    deploy:
      replicas: ${PLATFORM_NODE_AMOUNT}
```
