# @naulite/runtime-docker

Docker engine `RuntimeProvider` implementation backed by dockerode.

## Overview

Default container runtime for Naulite agents on Docker hosts. Implements pull, create, start, stop, logs, exec, and plan application through the Docker socket API.

## Run

Loaded by the control plane `RuntimeLoader` when a node reports Docker capability. No standalone CLI.

See [CONTEXT.md](../../CONTEXT.md) for architecture.

See [../../README.md](../../README.md) for monorepo setup.
