# Naulite Agent

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
3. Confirm NetBird CLI in the image and agent enrollment logs:

```bash
docker compose exec agent-1 netbird version
docker compose logs agent-1 | grep netbird
```

The agent starts the NetBird daemon (`netbird service run`), enrolls with `netbird up`, and reports `netbirdDeviceId` to the control plane. Expect `[netbird] enrollment complete` in logs.

NetBird host utilities (`coreutils` / `uname`) and the full `PATH` are baked into the agent image (`packages/agent/Dockerfile`). Bare-metal installs get the equivalent via `bootstrap/agent-install.sh` (coreutils + systemd `PATH`), not from agent runtime code.

4. Confirm the agent runs as non-root (Linux) or root (Windows Docker Desktop) and can reach Docker:

```bash
docker compose exec agent-1 id
docker compose exec agent-1 docker ps
```

5. Check enrollment logs (retries appear at debug level):

```bash
docker compose logs agent-1 | grep netbird
docker compose exec agent-1 netbird status
curl -s http://localhost:9470/status | grep netbirdConnected
```

If Docker socket permission fails on Linux, set `DOCKER_SOCKET_GID` to the host docker group id (`getent group docker | cut -d: -f3`) in `.env` and recreate `agent-1`.

On Windows Docker Desktop, use `NAULITE_AGENT_USER=0:0` (set by `dogfood/bin/dev.ps1`) and see `dogfood/README.md` for tmpfs and `netbird.local` host mapping.

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
