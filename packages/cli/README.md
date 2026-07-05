# @naulite/cli

Native Zig CLI for the Naulite control plane, distributed via an NPM wrapper that spawns the compiled binary.

See [CONTEXT.md](../../CONTEXT.md) for architecture and [PROGRESS.md](../../PROGRESS.md) for current development status.

## Install

Requires [Zig](https://ziglang.org/) **0.14+** (tested with 0.17 at `C:\zig`) to build the binary.

```bash
cd packages/cli
zig build
# Windows: zig-out\bin\platform.exe
./zig-out/bin/platform cluster status get
```

Copy the binary into the NPM package layout:

```bash
yarn copy:native
```

### NPM

From the monorepo root:

```bash
yarn workspace @naulite/cli build:all
yarn link
platform cluster status get
```

The `platform` bin (`bin/platform.js`) tries, in order:

1. `NAULITE_CLI_NATIVE` when set
2. `packages/cli/native/platform[.exe]` (after `yarn copy:native`)
3. `packages/cli/zig-out/bin/platform[.exe]` (after `zig build`)

## Remote access over NetBird

When you are **not** on the control plane host, use a panel-generated API key:

1. Open the dashboard on the control plane host and create an API key under **API Keys**.
2. Copy the secret immediately (it is shown only once).
3. Save credentials locally:

```bash
platform login --cp 100.64.0.10 --key plt_your_secret_here
```

4. Run commands normally:

```bash
platform cluster nodes get
platform cluster status get
```

You can also pass the host per command without saving it:

```bash
platform --cp 100.64.0.10 cluster status get
```

## Local auto-detect

When the CLI runs on a machine where the control plane is listening on port `8080`, it probes `/health` on loopback and **skips authentication** automatically. No login is required on the control plane host itself.

## Commands

Commands follow `platform cluster <resource> <action>` - resource namespace first, then action.

```bash
platform login --cp <netbird-ip> --key <secret> [--port 8080]
platform cluster nodes get
platform cluster services get
platform cluster instances get
platform cluster volumes get
platform cluster secrets get
platform cluster backups get
platform cluster status get
platform cluster manifests apply -f manifest.yml
platform cluster services delete <name>
platform cluster volumes delete <name>
platform cluster secrets delete <name>
platform cluster instances logs <instance> [--tail 200]
platform cluster services rotate-logs <service>
platform cluster instances exec <instance> -- echo hello
platform cluster builds run --service <name>
platform cluster registries get
platform cluster ingress get
platform cluster backups run <volume>
platform cluster backups restore <backupId>
```

## Environment

| Variable | Description |
|----------|-------------|
| `NAULITE_CP_URL` | Control plane base URL |
| `NAULITE_API_KEY` | API key secret for remote access |
| `NAULITE_TOKEN` | Alias for `NAULITE_API_KEY` |
| `NAULITE_CLI_NATIVE` | Absolute path to a native `platform` binary |

Credentials file: `~/.platform/credentials.json` with `{ "apiKey", "cpHost", "cpPort" }`.

## Layout

| Path | Role |
|------|------|
| `src/` | Zig CLI implementation |
| `bin/platform.js` | NPM entrypoint (spawns native binary) |
| `native/` | Copied binary after `yarn copy:native` |
