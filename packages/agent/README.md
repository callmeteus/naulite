# Platform Agent

Zig worker agent for Docker runtime operations and NetBird mesh enrollment.

## Manual verification (NetBird + Docker hardening)

### Unit tests

```bash
cd packages/agent
zig build test
```

```bash
cd platform
npm test -- tests/unit/bootstrap/AgentInstallScript.test.ts
```

### Dogfood container smoke test

1. Start the stack from `dogfood/` with a valid `NETBIRD_SETUP_KEY` in `.env`.
2. Rebuild the agent image: `docker compose up -d --build agent-1`.
3. Confirm NetBird CLI in the image:

```bash
docker compose exec agent-1 netbird version
```

4. Confirm the agent runs as non-root and can reach Docker:

```bash
docker compose exec agent-1 id
docker compose exec agent-1 docker ps
```

5. Check enrollment logs (retries appear at debug level):

```bash
docker compose logs agent-1 | grep netbird
curl -s http://localhost:9470/status | grep netbirdConnected
```

If Docker socket permission fails, set `DOCKER_SOCKET_GID` to the host docker group id (`getent group docker | cut -d: -f3`) in `.env` and recreate `agent-1`.

### Bare metal install with NetBird CLI

```bash
sudo bash bootstrap/agent-install.sh \
  --host http://localhost:8080 \
  --setup-key "<setup-key>" \
  --netbird-management-url http://netbird-server \
  --install-netbird \
  --dry-run
```

Remove `--dry-run` on a Linux amd64 host to install NetBird `0.35.2` and start the systemd unit.
