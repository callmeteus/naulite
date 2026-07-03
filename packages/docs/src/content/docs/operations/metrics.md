---
title: Metrics
description: Prometheus metrics and observability endpoints on the control plane.
---

# Metrics

The control plane exposes cluster inventory metrics for scraping and proxies PromQL queries to Prometheus when configured.

## Control plane exposition

| Route | Auth | Format |
|-------|------|--------|
| `GET /metrics` | Local loopback or API key | Prometheus text exposition 0.0.4 |

Example (dogfood with API key):

```bash
curl -s -H "Authorization: Bearer $ADMIN_API_KEY" \
  http://localhost:8080/metrics
```

Metrics are assembled by `PrometheusMetrics.collectText()` from current cluster state (nodes, services, runs, and related inventory).

## Prometheus proxy

The control plane can proxy read-only queries to a Prometheus HTTP API for dashboard charts:

| Variable | Default |
|----------|---------|
| `PROMETHEUS_URL` | `http://platform-prometheus:9090` |

Proxy routes forward `GET` requests under `/api/v1/` to the configured base URL. Upstream failures return `502` with a treated error payload.

## Dogfood stack

The root `docker-compose.yml` can include a Prometheus service for local scraping. Point scrapers at each control plane replica's `/metrics` endpoint on the internal network.

## Alpha limitations

- No formal SLO dashboards or alerting bundles ship with alpha.
- E2E and load-test metrics are out of CI scope; scrape dogfood manually during validation.
- Long-term retention and federation are operator responsibilities.

## Related

- [Operations runbook](/operations/runbook/) - health checks and escalation
- [Architecture](/architecture/) - control plane and agent data flows
