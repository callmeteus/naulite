---
title: Alpha scope
description: Boundaries for the Naulite alpha integration wave.
---

# Alpha scope

Naulite V1 is a **working scaffold** for local development, integration testing, and internal dogfood - not a production-hardened product.

## In scope

| Area | Status |
|------|--------|
| Manifest apply, parser, planner, scheduler | Implemented |
| Zig agents and Docker runtime (V1) | Implemented |
| Control plane API (Fastify + Sequelize) | Implemented |
| CLI and Vue dashboard | Implemented |
| GitOps apply and rollback | Implemented |
| Backups, log rotation, self-hosted NetBird | Implemented |
| Docker Compose dogfood stack | Implemented |
| CI (`verify` + `docker-smoke` jobs) | Implemented |
| Consolidated docs (`@naulite/docs`, this site) | Implemented |

## Out of scope (alpha)

- **E2E in CI** - run locally with `REQUIRE_DOCKER=true yarn test:e2e` before merging high-risk changes.
- **Production SLOs** and formal error budgets.
- **Multi-tenant hardening** beyond dogfood service-token auth.
- **NetBird cloud** (`api.netbird.io`) - self-hosted only.
- **Full production runbooks** - see [Operations runbook](/operations/runbook/) for dogfood-oriented procedures.

## Documentation migration

Legacy markdown under `platform/docs/*.md` is a one-line redirect to this package. Edit content in `packages/docs/src/content/docs/` and publish with `yarn workspace @naulite/docs build`.

## Related

- [Dogfood README](/dogfood/readme/) - repository quick start mirrored from the root README.
- [Continuous integration](/ci/) - CI jobs and local parity commands.
- [Release](/release/) - GHCR image publishing.
