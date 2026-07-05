---
title: Zig code guidelines
description: Comment and formatting conventions for Naulite Zig packages.
---

# Zig code guidelines (Platform)

Canonical reference: `packages/agent/src/runtime/docker/docker_api.zig`.

All new or changed Zig code in this monorepo must follow this style.

## Comments

### Public types (`pub const`, `pub enum`)

Use a single `///` line immediately before the type:

```zig
/// HTTP response from the Docker Engine API.
pub const DockerResponse = struct {
```

### Struct fields

- Blank line after the struct opening `{`.
- `//` comment on the line **above** each field (full sentence, trailing period).
- Blank line between fields.

```zig
pub const DockerApi = struct {
    // The allocator to use.
    allocator: std.mem.Allocator,

    // The path to the Docker socket.
    socket_path: []const u8,
```

### Public functions and methods

- One `///` summary line before the function.
- Parameters on **separate lines**, each preceded by a descriptive `//` comment.
- Function body on the line after the last parameter.

```zig
    /// Performs an HTTP request against the Docker Engine API.
    pub fn request(
        self: *const DockerApi,
        // The HTTP method.
        method: []const u8,
        // The API path.
        path: []const u8,
        // The request body.
        body: ?[]const u8,
    ) !DockerResponse {
```

### Private functions (`fn`)

- `///` is optional; use `//` on parameters when the signature spans multiple lines.
- Trivial one-line helpers may keep a compact signature.

### Do not use

- **Do not** use `@param`, `@returns`, or `@throws` (Javadoc/TSDoc style).
- **Do not** use inline `//` comments on the same line as a field (except in very local switches/loops).
- **Do not** leave duplicate blank lines between blocks (at most one empty line).

## Formatting

- Indentation: 4 spaces.
- Group imports: std first, then local crates (`@import`).
- **Every `if` / `else` must use a `{ }` block** - never a single-line body without braces (`if (x) return y;` is forbidden).
- Chained `else` on the same line as the previous closing `}` for if-else chains (see `AGENTS.md`).
- Module constants: `snake_case` or `SCREAMING_SNAKE` as already used in the file.
- Types: `PascalCase`. Functions: `camelCase`.

## Structs and enums

- `pub` methods after fields, separated by a blank line.
- Enums: variants in `camelCase`; `///` on the enum when it is public.
- Named `error` sets when reused (`LoadError`, `ApiError`).

## Tests

- `test "description in English"` block at the end of the file when tests exist.
- Same comment style on extracted test helpers.

## Build and layout

| Package | Code root | Entry |
|---------|-----------|-------|
| `packages/agent` | `src/` | `src/main.zig` |
| `packages/cli` | `src/` | `src/main.zig` |

The CLI **no longer** uses `zig/src/` - sources live directly under `packages/cli/src/`.

## Pre-commit checklist for Zig

- [ ] Structs with a `//` comment on each relevant public field
- [ ] `pub` functions with `///` and parameters documented with `//`
- [ ] No `@param` / `@returns`
- [ ] Every `if` / `else` uses a `{ }` block
- [ ] No extra blank lines
- [ ] `zig build` passes in the changed package
