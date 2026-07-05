---
title: Release
description: GHCR container image publishing via GitHub Actions.
---

# Release

Container images are published to GitHub Container Registry (GHCR) by the Release workflow (`.github/workflows/release.yml`).

## Images

| Image | Dockerfile |
|-------|------------|
| `ghcr.io/<owner>/naulite-agent` | `packages/agent/Dockerfile` |
| `ghcr.io/<owner>/naulite-control-plane` | `packages/control-plane/Dockerfile` |
| `ghcr.io/<owner>/naulite-ui` | `packages/ui/Dockerfile` |
| `ghcr.io/<owner>/naulite-ui-backend` | `packages/ui/packages/backend/Dockerfile` |

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

Naulite images published to GHCR use semver from git tags or commit SHA (see above). CI runs Trivy on built Naulite images (`naulite-agent`, `naulite-control-plane`, `naulite-ui`, `naulite-ui-backend`) and fails on **CRITICAL** vulnerabilities (`.github/workflows/ci.yml`, job `image-scan`).

## SBOM artifacts

The CI `image-scan` job also generates a **CycloneDX SBOM** per image (`format: cyclonedx`) and uploads it as a GitHub Actions artifact (`sbom-<image>.cyclonedx.json`, retained 90 days).

Use these artifacts for:

- Supply-chain audits and compliance requests
- Correlating image tags with dependency inventories at build time
- Feeding external scanners that accept CycloneDX JSON

SBOM generation runs after the vulnerability scan on the same built image matrix row. It does not replace the CRITICAL gate - both steps must pass.
