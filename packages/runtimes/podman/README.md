# @naulite/runtime-podman

Podman `RuntimeProvider` backed by the Docker-compatible Podman socket API (`podman.sock`).

The provider delegates to `@naulite/runtime-docker` through dockerode, defaulting to `/run/podman/podman.sock` (override with `PODMAN_SOCKET`).

See [platform context](../../CONTEXT.md) for architecture and integration details.
