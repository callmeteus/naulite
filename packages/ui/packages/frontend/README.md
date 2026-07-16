# @naulite/ui-frontend

Vue 3 admin dashboard for the Naulite control plane. Calls the BFF (`@naulite/ui-backend`) at `/api`, not the control plane directly.

## Overview

The frontend renders cluster status, manifests, services, and operational views. Authentication and ACL-sensitive calls go through the BFF, which uses `@naulite/sdk` against the control plane.

## Run

From the naulite repo root:

```bash
yarn workspace @naulite/ui-frontend dev
```

Requires `@naulite/ui-backend` on port **3001** (or set `ADMIN_API_URL` for the Vite proxy target).

Full UI stack:

```bash
yarn workspace @naulite/ui dev
```

## Scripts

```bash
yarn dev
yarn build
yarn lint
yarn typecheck
```

See [../README.md](../README.md) for the UI stack layout and [../../../README.md](../../../README.md) for full monorepo setup.
