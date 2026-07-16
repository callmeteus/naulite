# @naulite/agent

Zig worker agent for Docker runtime operations and NetBird mesh enrollment.

## Overview

The agent executes container workloads on nodes, reports health to the control plane, and enrolls in NetBird using setup keys from the control plane. Host utilities (`coreutils`, full `PATH`) are baked into the Docker image for consistent dogfood and bare-metal installs.

## Run

### Unit tests

```bash
cd packages/agent
zig build test
```

```bash
cd platform
npm test -- tests/unit/bootstrap/AgentInstallScript.test.ts
```

### Dogfood smoke test

1. Start the stack from `dogfood/` with a valid `NETBIRD_SETUP_KEY` in `.env`.
2. Rebuild: `docker compose up -d --build agent-1`.
3. Verify:

```bash
docker compose exec agent-1 netbird version
docker compose logs agent-1 | grep netbird
docker compose exec agent-1 id
docker compose exec agent-1 docker ps
curl -s http://localhost:9470/status
```

Expect `[netbird] enrollment complete` and `Management: Connected` from `netbird status`.

On Linux socket permission errors, set `DOCKER_SOCKET_GID` in `.env`. On Windows Docker Desktop see [dogfood/README.md](../../dogfood/README.md).

### Bare metal dry run

```bash
sudo bash bootstrap/agent-install.sh \
  --host http://localhost:8080 \
  --setup-key "<setup-key>" \
  --netbird-management-url http://netbird-server \
  --install-netbird \
  --dry-run
```

See [../../README.md](../../README.md) for monorepo setup.
