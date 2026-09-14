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
yarn dev
```

`yarn dev` starts the control plane (port **18080**), **Prometheus** (**19090**, Docker), a local **traefik-mock** (port **18099**), admin API (**3001**), frontend (**5173**), and docs.

Docker Desktop must be running for Prometheus. The control plane proxies PromQL queries to `http://127.0.0.1:19090`.

Default bootstrap user when the control plane database is empty:

| Field | Value |
| ----- | ----- |
| Email | `admin@example.com` |
| Password | `admin` |

The username stored in the control plane is the normalized email (`admin@example.com`).

Vite proxies `/api` to `http://localhost:3001` and strips the `/api` prefix. Local dev does not require `ADMIN_API_KEY`.

If port **8080** is already used by another project, keep the control plane on **18080** (default for `yarn dev`) or set `CONTROL_PLANE_INSTANCES` on the ui-backend.

## Docker

Root `docker-compose.yml` runs `ui-backend` and `ui` (nginx + static frontend). Set `ADMIN_API_KEY` in `.env` when the backend cannot reach the control plane via loopback.

Default dogfood UI: http://localhost:13000

See [../../README.md](../../README.md) for monorepo setup.
