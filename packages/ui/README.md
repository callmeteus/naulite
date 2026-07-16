# Naulite UI

Web dashboard for Naulite (Vue frontend + Fastify admin BFF).

## Overview

| Package | Path | Role |
| ------- | ---- | ---- |
| `@naulite/ui-frontend` | `packages/frontend` | Vue 3 SPA served by nginx |
| `@naulite/ui-backend` | `packages/backend` | Admin API; calls control plane with service credentials |

The browser talks only to `/api` on the UI host. nginx proxies to `ui-backend`, which calls the control plane over the Docker network with `ADMIN_API_KEY`.

## Run

From the Naulite repo root:

```bash
# Terminal 1 - control plane
yarn workspace @naulite/control-plane start

# Terminal 2 - admin API
yarn workspace @naulite/ui-backend dev

# Terminal 3 - frontend
yarn workspace @naulite/ui-frontend dev
```

Vite proxies `/api` to `http://localhost:3001`. Local dev against loopback control plane does not require `ADMIN_API_KEY`.

## Docker

Root `docker-compose.yml` runs `ui-backend` and `ui` (nginx + static frontend). Set `ADMIN_API_KEY` in `.env` when the backend cannot reach the control plane via loopback.

Default dogfood UI: http://localhost:13000

See [../../README.md](../../README.md) for monorepo setup.
