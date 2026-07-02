# @platform/ui-frontend

Vue 3 admin dashboard. Calls the admin API (`@platform/ui-backend`) at `/api`, not the control plane directly.

See [../README.md](../README.md) for the full UI stack layout.

## Development

```bash
yarn workspace @platform/ui-frontend dev
```

Requires `@platform/ui-backend` on port 3001 (or set `ADMIN_API_URL` for the Vite proxy target).
