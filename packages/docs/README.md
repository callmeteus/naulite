# @naulite/docs

English-only Naulite documentation site (Astro + Starlight).

## Overview

Static docs package for platform architecture, dogfood guides, and operator runbooks. Legacy `platform/docs/*.md` files redirect here.

## Run

From the Naulite repository root:

```bash
yarn workspace @naulite/docs dev
yarn workspace @naulite/docs build
yarn workspace @naulite/docs preview
```

Dev server: http://localhost:4321

## Content

Edit markdown under `src/content/docs/`.

## Scripts

| Command | Action |
| ------- | ------ |
| `yarn workspace @naulite/docs dev` | Astro dev server |
| `yarn workspace @naulite/docs build` | Static site to `dist/` |
| `yarn workspace @naulite/docs preview` | Preview production build |

See [../../README.md](../../README.md) for monorepo setup.
