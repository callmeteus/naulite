# @naulite/docs

English-only Naulite documentation site built with [Astro](https://astro.build) and [Starlight](https://starlight.astro.build).

## Commands

From the `naulite/` repository root:

```bash
yarn workspace @naulite/docs dev
yarn workspace @naulite/docs build
yarn workspace @naulite/docs preview
```

Dev server defaults to `http://localhost:4321`.

## Content

Edit markdown under `src/content/docs/`. Legacy `platform/docs/*.md` files are one-line redirects to this package.

## Build output

Static site is emitted to `dist/` (included in Turborepo `build` outputs).
