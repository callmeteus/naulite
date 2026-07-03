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
