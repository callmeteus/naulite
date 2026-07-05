---
title: Log rotation
description: Scheduled log rotation policies for platform services.
---

# Log rotation

Log rotation policies keep service log directories bounded without manual operator intervention.

## Policy model

```yaml
services:
    api:
        logRotation:
            schedule: "0 0 * * *"
            paths:
                - /app/logs/*.log
            maxSizeMb: 200
            maxFiles: 14
            compress: true
            excludes:
                - "**/*.gz"
```

## Execution flow

1. Log rotation scheduler detects a due policy.
2. Control plane sends `logRotationTask` to the agent running the service.
3. Agent rotates, truncates, or compresses files per policy.
4. Control plane stores run metadata for audit and UI history.

## Safety defaults

- Conservative file patterns reduce accidental data loss.
- CLI supports manual `logs rotate` for on-demand runs before enabling aggressive schedules.
- Dry-run support is planned for operator validation.

## CLI operations

```bash
naulite cluster services rotate-logs <serviceName>
```

## UI

The dashboard lists rotation run history alongside backup runs in future phases. V1 exposes service policies through manifest apply and manual CLI triggers.
