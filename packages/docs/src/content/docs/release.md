---
title: Release
description: GHCR container image publishing via GitHub Actions.
---

# Release

Container images are published to GitHub Container Registry (GHCR) by the Release workflow (`.github/workflows/release.yml`).

## Images

| Image | Dockerfile |
|-------|------------|
| `ghcr.io/<owner>/platform-agent` | `packages/agent/Dockerfile` |
| `ghcr.io/<owner>/platform-control-plane` | `packages/control-plane/Dockerfile` |
| `ghcr.io/<owner>/platform-ui` | `packages/ui/Dockerfile` |
| `ghcr.io/<owner>/platform-ui-backend` | `packages/ui/packages/backend/Dockerfile` |

Replace `<owner>` with the GitHub organization or user that owns the repository.

Each image is tagged with:

- **Semver** - version from the git tag without the `v` prefix (for example `1.2.3` from `v1.2.3`)
- **Commit SHA** - full git commit SHA of the build

## Trigger a release

**Recommended:** push an annotated semver tag:

```bash
git tag v1.0.0
git push origin v1.0.0
```

The workflow also runs on `workflow_dispatch`. In the Actions tab, open **Release**, choose **Run workflow**, and select a `v*` tag ref when re-running a past release.

Manual runs from a branch tag images as `dev-<short-sha>` plus the commit SHA.

## Image pinning policy

Third-party container images in dogfood and infra must use **immutable version tags**, never `:latest`.

| Image | Pinned tag | Source |
|-------|------------|--------|
| `minio/minio` | `RELEASE.2025-09-07T16-13-09Z` | [Docker Hub tags](https://hub.docker.com/r/minio/minio/tags?name=RELEASE.2025-09-07) |
| `netbirdio/dashboard` | `v2.90.0` | [Docker Hub tags](https://hub.docker.com/r/netbirdio/dashboard/tags?name=v2.90.0) |
| `netbirdio/netbird-server` | `0.73.2` | [Docker Hub tags](https://hub.docker.com/r/netbirdio/netbird-server/tags?name=0.73.2) |

Before changing a pinned tag:

1. Confirm the tag exists on the official registry listing (Docker Hub, GHCR, Quay, etc.).
2. Copy the tag exactly as published - do not invent semver or reuse tags from memory.
3. Update the compose/manifest and this table in the same PR.
4. Note the registry URL used for verification in the PR description.

Platform images published to GHCR use semver from git tags or commit SHA (see above). CI runs Trivy on built Platform images (`platform-agent`, `platform-control-plane`, `platform-ui`, `platform-ui-backend`) and fails on **CRITICAL** vulnerabilities (`.github/workflows/ci.yml`, job `image-scan`).
