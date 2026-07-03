# @platform/runtime-containerd

containerd `RuntimeProvider` stub that returns `RuntimeNotConfiguredError` until a nerdctl-backed implementation is added.

## Status

- Registered in the control plane `RuntimeLoader` alongside Docker and Podman.
- Every method throws `RuntimeNotConfiguredError` with runtime id `containerd`.
- Full containerd support requires wiring [nerdctl](https://github.com/containerd/nerdctl) (or containerd CRI shims) for pull, create, start, stop, logs, exec, and plan application.

## Follow-up

- Add nerdctl CLI or containerd gRPC client integration mirroring `DockerRuntimeProvider`.
- Expose runtime selection on agents by node capability (`containerd` vs `docker` vs `podman`).
- Document socket paths and bootstrap requirements on rootless/containerd nodes.

See [platform context](../../CONTEXT.md) for architecture and integration details.
