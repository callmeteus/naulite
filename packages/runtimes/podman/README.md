# @naulite/runtime-podman

Podman `RuntimeProvider` backed by the Docker-compatible Podman socket API.

## Overview

Delegates to `@naulite/runtime-docker` through dockerode. Defaults to `/run/podman/podman.sock`; override with `PODMAN_SOCKET`.

## Run

Registered in the control plane `RuntimeLoader` alongside Docker and containerd. Selected when agents expose Podman capability.

See [CONTEXT.md](../../CONTEXT.md) for architecture.

See [../../README.md](../../README.md) for monorepo setup.
