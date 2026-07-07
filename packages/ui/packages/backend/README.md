# @naulite/ui-backend

Fastify BFF for the admin dashboard. Exposes the HTTP surface the frontend expects and delegates to the control plane via `@naulite/sdk`.

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `0.0.0.0` | Listen address |
| `PORT` | `3001` | Listen port |
| `CONTROL_PLANE_INSTANCES` | `http://localhost:8080` | Comma-separated control plane base URLs (first is primary) |
| `ADMIN_API_KEY` | (unset) | Bearer token for control plane calls |

## Development

```bash
yarn workspace @naulite/ui-backend dev
```
