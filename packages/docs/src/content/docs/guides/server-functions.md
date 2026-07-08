---
title: Server functions
description: Ephemeral, Lambda-style workloads declared with the function block in manifests.
---

# Server functions

A service with a `function:` block is treated as **ephemeral execution** (Lambda-style), not a long-running replica set.

- No persistent instances are kept (`deploy.replicas` is invalid on function services).
- Each invocation creates a one-off container on an eligible agent node.
- The control plane records every run in `function_runs` (status, logs, exit code, duration).
- `timeout` uses human-readable durations (`30s`, `1m`, `5m`, `2h`), clamped between 1s and 15m.

## Manifest declaration

```yaml
name: jobs

services:
  nightly-cleanup:
    image: alpine:3.21
    command: ["sh", "-lc", "echo cleanup && sleep 2"]
    cluster:
      labels:
        role: worker
    function:
      timeout: 30s
      trigger:
        http: true
        cron: "0 3 * * *"
```

### `function` fields

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `timeout` | duration string | `60s` | Max wall time before the agent stops the container |
| `trigger.http` | boolean | `false` | Allow API, CLI, and HTTP ingress invocations |
| `trigger.cron` | cron expression | - | Schedule automatic invocations on the control plane leader |

### Validation rules

- `deploy.replicas` cannot be set when `function` is present.
- `ingress` requires `function.trigger.http: true` (ingress host routes to function invoke).
- API, CLI, and HTTP ingress invocations require `trigger.http: true`.
- Cron invocations require `trigger.cron` to be set.

Supported duration units: `s` (seconds), `m` (minutes), `h` (hours). Examples: `30s`, `1m`, `15m`.

## Triggers

| Source | How it runs | Requirements |
|--------|-------------|--------------|
| `api` | `POST /functions/:name/invoke` | Leader replica, `workloads:write`, `trigger.http: true` |
| `cli` | `naulite cluster functions invoke` | Same as API (forwards to control plane) |
| `cron` | `FunctionScheduler` on the leader | `trigger.cron` expression |
| `http` | Public ingress hostname | `ingress` host + `trigger.http: true` |

### HTTP ingress

When a function service has ingress enabled and `trigger.http: true`, unmatched requests to that hostname are handled by the control plane ingress fallback:

1. Match `Host` (or `X-Forwarded-Host`) against the service ingress hostname.
2. Invoke the function with `source: http` and a JSON payload containing method, URL, headers, and body.
3. Respond with `202 Accepted` and `{ "ok": true, "runId": "..." }`.

Poll `GET /functions/:name/runs/:id` for completion, logs, and exit code.

## Execution flow

1. Caller triggers invoke (API, CLI, cron, or HTTP ingress).
2. Control plane selects a node via the same scheduler used for workloads.
3. Control plane creates a `function_runs` row with status `running`.
4. Agent receives `POST /tasks/function`, pulls the image if needed, starts the container, waits for exit or timeout.
5. Control plane updates the run with `completed`, `timed_out`, or `failed`, plus logs and `exitCode`.

Run statuses: `running`, `completed`, `timed_out`, `failed`.

## HTTP API

All routes require authentication (local session or API key) unless noted.

### Invoke

```http
POST /functions/:name/invoke
Content-Type: application/json

{
  "payload": { "job": "reindex" },
  "environment": { "DRY_RUN": "true" }
}
```

Response `200`:

```json
{ "runId": "550e8400-e29b-41d4-a716-446655440000" }
```

Requires the **leader** control plane instance (`503 not_leader` on followers).

### List runs

```http
GET /functions/:name/runs?page=1&limit=20
```

### Get run

```http
GET /functions/:name/runs/:id
```

Returns full record including `logs`, `exitCode`, `durationMs`, and `errorMessage` when available.

## CLI

```bash
naulite cluster functions invoke hello [--payload @payload.json]
naulite cluster functions runs list hello
naulite cluster functions runs get hello <runId>
```

Point the CLI at the **leader** URL in HA setups (`NAULITE_CP_URL` or cluster config).

## SDK

```typescript
const client = new NauliteClient({ baseUrl: leaderUrl, apiKey });

const { runId } = await client.invokeFunction("hello", {
  payload: { job: "reindex" }
});

const run = await client.getFunctionRun("hello", runId);
```

## Scheduling and secrets

- Function services are planned with **zero replicas**; only invocations spawn containers.
- `environment`, `cluster.labels`, `capabilities`, `networks`, `volumes`, and secret refs on the service are passed to the ephemeral container like a normal deploy spec.
- Cron evaluation runs on a 60s poll interval on the leader only.

## Example manifest

See [Manifest examples](/guides/manifest-examples/#function-invokecomposeyml) for a minimal `function-invoke` sample.

Apply:

```bash
naulite cluster manifests apply -f function-invoke.compose.yml
naulite cluster functions invoke hello
```
