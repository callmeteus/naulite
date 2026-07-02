# Admin authentication

The admin dashboard uses **service token** authentication in the BFF (`ui-backend`).

## Current flow (dogfood)

1. Set `ADMIN_API_KEY` in the `.env` file at the root of the `platform/` monorepo.
2. `bin/dev.sh` / `bin/dev.ps1` inject the key into the BFF and control plane when needed.
3. The frontend talks only to `/api` (BFF). The BFF forwards requests to the control plane with `Authorization: Bearer <ADMIN_API_KEY>`.

## When to use

- Local and dogfood environments with trusted operators.
- CI automation that calls the BFF directly.

## Optional next step

BFF session cookies and an `admin_users` table in the control plane for operators without access to `.env`.
