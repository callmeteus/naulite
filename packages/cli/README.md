# @naulite/cli

Native Zig CLI for the Naulite control plane, distributed via an NPM wrapper that spawns the compiled binary.

See [CONTEXT.md](../../CONTEXT.md) for architecture and [CHANGELOG.md](../../CHANGELOG.md) for current development status.

## Install

Requires [Zig](https://ziglang.org/) **0.16.0** (see `infra/zig-toolchain.env`) to build the binary.

```bash
cd packages/cli
zig build
# Windows: zig-out\bin\naulite.exe
./zig-out/bin/naulite cluster status get
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
naulite cluster status get
```

The `naulite` bin (`bin/naulite.js`) tries, in order:

1. `NAULITE_CLI_NATIVE` when set
2. `packages/cli/native/naulite[.exe]` (after `yarn copy:native`)
3. `packages/cli/zig-out/bin/naulite[.exe]` (after `zig build`)

## Remote access over NetBird

When you are **not** on the control plane host, use a panel-generated API key:

1. Open the dashboard on the control plane host and create an API key under **API Keys**.
2. Copy the secret immediately (it is shown only once).
3. Save credentials locally:

```bash
naulite login --cp 100.64.0.10 --key plt_your_secret_here
```

4. Run commands normally:

```bash
naulite cluster nodes get
naulite cluster status get
```

You can also pass the host per command without saving it:

```bash
naulite --cp 100.64.0.10 cluster status get
```

## Local auto-detect

When the CLI runs on a machine where the control plane is listening on port `8080`, it probes `/health` on loopback and **skips authentication** automatically. No login is required on the control plane host itself.

## Commands

Commands follow `naulite cluster <resource> <action>` - resource namespace first, then action.

```bash
naulite login --cp <netbird-ip> --key <secret> [--port 8080]
naulite cluster nodes get
naulite cluster services get
naulite cluster instances get
naulite cluster volumes get
naulite cluster secrets get
naulite cluster backups get
naulite cluster status get
naulite cluster manifests apply -f manifest.yml
naulite cluster services delete <name>
naulite cluster volumes delete <name>
naulite cluster secrets delete <name>
naulite cluster instances logs <instance> [--tail 200]
naulite cluster services rotate-logs <service>
naulite cluster instances exec <instance> -- echo hello
naulite cluster builds run --service <name>
naulite cluster registries get
naulite cluster ingress get
naulite cluster backups run <volume>
naulite cluster backups restore <backupId>
```

## Environment

| Variable | Description |
|----------|-------------|
| `NAULITE_CP_URL` | Control plane base URL |
| `NAULITE_API_KEY` | API key secret for remote access |
| `NAULITE_TOKEN` | Alias for `NAULITE_API_KEY` |
| `NAULITE_CLI_NATIVE` | Absolute path to a native `naulite` binary |

Credentials file: `~/.naulite/credentials.json` with `{ "apiKey", "cpHost", "cpPort" }`.

## Layout

| Path | Role |
|------|------|
| `src/` | Zig CLI implementation |
| `bin/naulite.js` | NPM entrypoint (spawns native binary) |
| `native/` | Copied binary after `yarn copy:native` |
