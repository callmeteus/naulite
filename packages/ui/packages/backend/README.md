# @naulite/ui-backend

Fastify backend-for-frontend for the Naulite admin dashboard. Exposes the HTTP surface the Vue UI expects and delegates to the control plane through `@naulite/sdk`.

Default port: **3001**

## Overview

This package is **not** the control plane. It proxies authenticated admin operations to one or more control plane instances configured via environment variables.

## Run

From the naulite repo root:

```bash
yarn workspace @naulite/ui-backend dev
```

With the full UI stack:

```bash
yarn workspace @naulite/ui dev
```

## Environment

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `HOST` | `0.0.0.0` | Listen address |
| `PORT` | `3001` | Listen port |
| `CONTROL_PLANE_INSTANCES` | `http://localhost:8080` | Comma-separated control plane base URLs (first is primary) |
| `ADMIN_API_KEY` | (unset) | Bearer token for control plane calls |

## Scripts

```bash
yarn dev
yarn build
yarn lint
yarn typecheck
```

See [../../../README.md](../../../README.md) for full monorepo setup.
