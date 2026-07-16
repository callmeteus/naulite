# @naulite/runtime-containerd

containerd `RuntimeProvider` stub pending nerdctl integration.

## Overview

Registered in the control plane `RuntimeLoader` but not yet operational. Every method throws `RuntimeNotConfiguredError` with runtime id `containerd` until a nerdctl-backed implementation ships.

## Status

- Stub registered alongside Docker and Podman providers.
- Full support requires [nerdctl](https://github.com/containerd/nerdctl) or containerd gRPC client wiring for pull, create, start, stop, logs, exec, and plan apply.
- Follow-up: expose runtime selection on agents by node capability; document socket paths for rootless containerd nodes.

See [CONTEXT.md](../../CONTEXT.md) for architecture.

See [../../README.md](../../README.md) for monorepo setup.
