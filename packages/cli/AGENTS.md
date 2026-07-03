# @platform/cli - Agent Guidelines

Native Zig CLI for the Platform control plane. English code and comments.

## Toolchain

- **Zig 0.16.0** (pinned in `build.zig.zon` and `infra/zig-toolchain.env`)
- Uses `std.process.Init` (juicy main) and `std.Io` for filesystem and HTTP I/O

## Layout

| Path | Role |
|------|------|
| `src/main.zig` | Entry point, global flags, login, dispatch |
| `src/commands.zig` | Control plane command handlers |
| `src/resolve.zig` | Local vs remote CP resolution |
| `src/credentials.zig` | `~/.platform/credentials.json` load/save |
| `src/control_plane_client.zig` | HTTP client (auth + tenant headers) |
| `src/config.zig` | Resolved connection settings |
| `src/io_output.zig` | Buffered stdout/stderr writers |
| `src/i18n.zig` | User-facing message strings |

## Conventions

- Keep files under 700 lines; extract helpers when growing
- Pass `std.Io` explicitly for filesystem and HTTP client setup
- Use `std.Io.Dir.readFile(Dir.cwd(), io, path, buf)` for bounded file reads
- Use `allocRemaining` with `.unlimited` or `.limited(n)` for credential file reads
- Multi-tenant: optional `tenantSlug` in credentials; `X-Platform-Tenant` header when set

## Build

```bash
zig build
zig build test
```
