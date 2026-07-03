# @platform/docs

English-only Platform documentation site built with [Astro](https://astro.build) and [Starlight](https://starlight.astro.build).

## Commands

From the `platform/` repository root:

```bash
yarn workspace @platform/docs dev
yarn workspace @platform/docs build
yarn workspace @platform/docs preview
```

Dev server defaults to `http://localhost:4321`.

## Content

Edit markdown under `src/content/docs/`. Legacy `platform/docs/*.md` files are one-line redirects to this package.

## Build output

Static site is emitted to `dist/` (included in Turborepo `build` outputs).
