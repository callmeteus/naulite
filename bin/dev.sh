#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "[dev] Platform root: $ROOT"

if [[ ! -f .env ]]; then
    cp .env.example .env
    echo "[dev] Created .env from .env.example"
fi

# shellcheck disable=SC1091
set -a
source .env
set +a

NETBIRD_CONFIG="$ROOT/infra/netbird/config.yaml"
if [[ ! -f "$NETBIRD_CONFIG" ]]; then
    export NETBIRD_DOMAIN="${NETBIRD_DOMAIN:-netbird.local}"
    export NETBIRD_HTTP_PROTOCOL="${NETBIRD_HTTP_PROTOCOL:-http}"
    echo "[dev] Initializing NetBird config (NETBIRD_DOMAIN=$NETBIRD_DOMAIN) ..."
    bash "$ROOT/scripts/init-netbird-config.sh"
else
    echo "[dev] NetBird config already present at infra/netbird/config.yaml"
fi

echo "[dev] Starting docker compose (build + detached) ..."
docker compose up -d --build

echo "[dev] Waiting for control plane health on http://localhost:8080/health ..."
ready=0
for _ in $(seq 1 60); do
    if curl -sf "http://localhost:8080/health" >/dev/null 2>&1; then
        ready=1
        break
    fi
    sleep 2
done

if [[ "$ready" -ne 1 ]]; then
    echo "[dev] Control plane did not become healthy in time. Check: docker compose logs control-plane-1" >&2
    exit 1
fi

echo "[dev] Control plane is healthy."

if [[ -z "${ADMIN_API_KEY:-}" ]]; then
    echo "[dev] ADMIN_API_KEY is empty - creating a dev API key via loopback ..."
    key_response="$(curl -sf -X POST "http://localhost:8080/api-keys" \
        -H "Content-Type: application/json" \
        -d '{"name":"dev-admin"}')"
    new_key="$(printf '%s' "$key_response" | node -e "
        const data = JSON.parse(require('fs').readFileSync(0, 'utf8'));
        process.stdout.write(data.secret ?? '');
    ")"

    if [[ -n "$new_key" ]]; then
        if grep -q '^ADMIN_API_KEY=' .env; then
            sed -i.bak "s|^ADMIN_API_KEY=.*|ADMIN_API_KEY=$new_key|" .env
            rm -f .env.bak
        else
            printf '\nADMIN_API_KEY=%s\n' "$new_key" >> .env
        fi
        export ADMIN_API_KEY="$new_key"
        echo "[dev] Wrote ADMIN_API_KEY to .env and restarting ui-backend ..."
        docker compose up -d ui-backend
    else
        echo "[dev] Warning: could not parse API key secret from control plane response." >&2
    fi
else
    echo "[dev] ADMIN_API_KEY already set in .env"
fi

echo ""
echo "[dev] Stack is up."
echo "  UI:              http://localhost:3000"
echo "  Control plane:   http://localhost:8080"
echo "  Agent health:    http://localhost:9470/health"
echo ""
echo "Useful commands:"
echo "  docker compose logs -f"
echo "  docker compose down"
