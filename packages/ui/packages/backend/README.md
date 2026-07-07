# @naulite/ui-backend

Fastify BFF for the admin dashboard. Exposes the HTTP surface the frontend expects and delegates to the control plane via `@naulite/sdk`.

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `0.0.0.0` | Listen address |
| `PORT` | `3001` | Listen port |
| `CONTROL_PLANE_URL` | `http://localhost:8080` | Control plane base URL |
| `CONTROL_PLANE_INSTANCES` | empty | HA map `cp-1=http://control-plane-1:8080,cp-2=...` for leader retries |
| `ADMIN_API_KEY` | (unset) | Bearer token for control plane calls |

## Development

```bash
yarn workspace @naulite/ui-backend dev
```
