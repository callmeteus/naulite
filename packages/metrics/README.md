# @naulite/metrics

Naulite observability stack: Prometheus configuration and Docker Compose fragment.

## Overview

Provides Prometheus scrape config, file-based service discovery sync from the control plane leader, and a compose include for dogfood/production stacks. The UI and control plane proxy PromQL queries through authenticated routes.

## Environment

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `PROMETHEUS_URL` | `http://naulite-prometheus:9090` | Base URL for PromQL proxy |
| `NAULITE_PROMETHEUS_FILE_SD_DIR` | `/var/lib/naulite/prometheus/file_sd` | Leader-written scrape targets |
| `NAULITE_METRICS_SYNC_ENABLED` | `true` | Enable leader-only target sync |
| `NAULITE_PROMETHEUS_HOST_PORT` | `19090` | Host port for local/dogfood |

## Run

Production: started via `bootstrap/control-plane-install.sh`.

Dogfood compose includes:

```yaml
include:
    - path: ../packages/metrics/compose/metrics-stack.yml
```

## PromQL proxy routes

- `GET /metrics/query`
- `GET /metrics/query_range`
- `GET /metrics/labels`
- `GET /metrics/label/:name/values`

`GET /metrics` remains the Prometheus text exposition endpoint for control plane self-scrape.

Only the elected control plane leader writes `${NAULITE_PROMETHEUS_FILE_SD_DIR}/naulite_targets.json`.

See [../../README.md](../../README.md) for monorepo setup.
