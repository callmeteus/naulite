# @naulite/metrics

Naulite observability stack: Prometheus configuration and Docker Compose fragment.

## Environment contract

| Variable | Description | Default |
|----------|-------------|---------|
| `PROMETHEUS_URL` | Base URL for PromQL proxy requests from the control plane and UI BFF | `http://naulite-prometheus:9090` |
| `NAULITE_PROMETHEUS_FILE_SD_DIR` | Writable directory where the leader control plane writes file-based scrape targets | `/var/lib/naulite/prometheus/file_sd` |
| `NAULITE_METRICS_SYNC_ENABLED` | Enables leader-only scrape target sync | `true` |
| `NAULITE_PROMETHEUS_HOST_PORT` | Optional host port mapping for dogfood/local installs | `19090` |

## Deployment

Production installs start this stack via `bootstrap/control-plane-install.sh`.

Dogfood and other compose stacks should `include:` this file instead of duplicating Prometheus YAML:

```yaml
include:
    - path: ../packages/metrics/compose/metrics-stack.yml
```

## Leader sync

Only the elected control plane leader writes `${NAULITE_PROMETHEUS_FILE_SD_DIR}/naulite_targets.json`.
Mount the `naulite-prometheus-file-sd` volume (or an equivalent host path) into control plane containers at
`NAULITE_PROMETHEUS_FILE_SD_DIR` so Prometheus and the leader share the same directory.

## PromQL proxy

The control plane exposes authenticated proxy routes:

- `GET /metrics/query`
- `GET /metrics/query_range`
- `GET /metrics/labels`
- `GET /metrics/label/:name/values`

`GET /metrics` remains the Prometheus text exposition endpoint for control plane self-scrape.
