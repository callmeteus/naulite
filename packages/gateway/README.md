# @naulite/gateway

Traefik `GatewayProvider` that publishes routes through a NetBird reverse proxy endpoint.

## Overview

Integrates Naulite ingress with Traefik and NetBird so services exposed on the mesh receive consistent routing and TLS termination policies defined by the control plane.

## Run

Used by the control plane at runtime when Traefik profile or gateway modules are enabled. No standalone dev server.

See [CONTEXT.md](../../CONTEXT.md) for architecture and [../../README.md](../../README.md) for monorepo setup.
