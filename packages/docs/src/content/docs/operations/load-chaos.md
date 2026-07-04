---
title: Load and chaos testing
description: Local k6 load tests and chaos scripts for Platform cluster resilience.
---

# Load and chaos testing

Use local scripts to stress the control plane API and inject faults before promoting changes to staging. Script paths are placeholders in the alpha scaffold - wire them to your cluster endpoints before running in shared environments.

## Load testing (k6)

Planned location: `scripts/load/`

| Script (planned) | Purpose |
|------------------|---------|
| `scripts/load/health.js` | Baseline `GET /health` and `/health/ready` RPS |
| `scripts/load/apply.js` | Repeated manifest apply with small fixture |
| `scripts/load/nodes.js` | Node list and heartbeat-adjacent read traffic |

Example invocation once scripts exist:

```bash
k6 run scripts/load/health.js \
  -e PLATFORM_CP_URL=http://localhost:8080 \
  -e ADMIN_API_KEY=$ADMIN_API_KEY
```

### What to watch

- p95 latency on `/health/ready` with PostgreSQL connected
- HTTP 503 rate on mutating routes when hitting non-leader replicas (expected without sticky routing)
- Agent dispatch queue depth under concurrent applies

## Chaos testing

Planned location: `scripts/chaos/`

| Script (planned) | Purpose |
|------------------|---------|
| `scripts/chaos/kill-leader.sh` | Stop the current CP leader mid-apply |
| `scripts/chaos/pause-postgres.sh` | Simulate database unavailability |
| `scripts/chaos/partition-agent.sh` | Block agent HTTP from control plane |

Run chaos only against **local dogfood** or disposable staging clusters. Never target production.

### Suggested workflow

1. Start dogfood: see [Install](/get-started/install/)
2. Apply a fixture manifest from [Manifest examples](/guides/manifest-examples/)
3. Run a k6 baseline from `scripts/load/`
4. Execute one chaos script from `scripts/chaos/`
5. Confirm recovery via [Failover](/operations/failover/) checks

## CI scope

End-to-end and chaos suites are **local-only** in the alpha wave. See [Continuous integration](/ci/) for what runs in GitHub Actions.

## Related

- [Metrics](/operations/metrics/) - Prometheus scraping during load tests
- [Operations runbook](/operations/runbook/) - incident data to collect after failed chaos runs
