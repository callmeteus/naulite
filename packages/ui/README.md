# Naulite UI

Web dashboard for Naulite. Split into a Vue frontend and a Fastify admin API (BFF).

## Packages

| Package | Path | Role |
|---------|------|------|
| `@naulite/ui-frontend` | `packages/frontend` | Vue 3 SPA served by nginx |
| `@naulite/ui-backend` | `packages/backend` | Admin API; calls control plane with service credentials |

The browser talks only to `/api` on the UI host. nginx proxies that to `ui-backend`, which calls the control plane over the Docker network with `ADMIN_API_KEY`.

## Development

```bash
# Terminal 1 - control plane
yarn workspace @naulite/control-plane start

# Terminal 2 - admin API
yarn workspace @naulite/ui-backend dev

# Terminal 3 - frontend
yarn workspace @naulite/ui-frontend dev
```

Vite proxies `/api` to `http://localhost:3001` (admin API). Local dev against a loopback control plane does not require `ADMIN_API_KEY`.

## Docker

Root `docker-compose.yml` runs `ui-backend` and `ui` (nginx + static frontend). Set `ADMIN_API_KEY` in `.env` to a control plane API key when the backend cannot reach the CP via loopback.
