#!/usr/bin/env bash
set -euo pipefail

DOGFOOD="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DOGFOOD"

echo "[dev] Dogfood root: $DOGFOOD"

derive_netbird_public_management_url() {
    if [[ -n "${NETBIRD_PUBLIC_MANAGEMENT_URL:-}" ]]; then
        printf '%s' "${NETBIRD_PUBLIC_MANAGEMENT_URL}"
        return 0
    fi

    local protocol="${NETBIRD_HTTP_PROTOCOL:-http}"
    local port="${NETBIRD_SERVER_PORT:-9081}"
    local domain="${NETBIRD_DOMAIN:-netbird.local}"
    local url="${protocol}://${domain}"

    if [[ "${protocol}" == "http" && "${port}" != "80" ]] \
        || [[ "${protocol}" == "https" && "${port}" != "443" ]]; then
        url="${url}:${port}"
    fi

    printf '%s' "${url}"
}

set_env_var() {
    local key="$1"
    local value="$2"
    local file="${DOGFOOD}/.env"

    if grep -q "^${key}=" "${file}" 2>/dev/null; then
        sed -i.bak "s|^${key}=.*|${key}=${value}|" "${file}"
        rm -f "${file}.bak"
    else
        printf '%s=%s\n' "${key}" "${value}" >> "${file}"
    fi
}

if [[ ! -f .env ]]; then
    cp .env.example .env
    echo "[dev] Created .env from .env.example"
fi

# shellcheck disable=SC1091
set -a
source .env
set +a

derived_public_url="$(derive_netbird_public_management_url)"
if [[ -z "${NETBIRD_PUBLIC_MANAGEMENT_URL:-}" ]]; then
    export NETBIRD_PUBLIC_MANAGEMENT_URL="${derived_public_url}"
    set_env_var "NETBIRD_PUBLIC_MANAGEMENT_URL" "${NETBIRD_PUBLIC_MANAGEMENT_URL}"
    echo "[dev] Derived NETBIRD_PUBLIC_MANAGEMENT_URL=${NETBIRD_PUBLIC_MANAGEMENT_URL}"
fi

if [[ -z "${NAULITE_BOOTSTRAP_ADMIN_USERNAME:-}" ]]; then
    export NAULITE_BOOTSTRAP_ADMIN_USERNAME="admin@naulite.local"
    set_env_var "NAULITE_BOOTSTRAP_ADMIN_USERNAME" "${NAULITE_BOOTSTRAP_ADMIN_USERNAME}"
fi

if [[ -z "${NAULITE_BOOTSTRAP_ADMIN_PASSWORD:-}" ]]; then
    export NAULITE_BOOTSTRAP_ADMIN_PASSWORD="naulite-dev"
    set_env_var "NAULITE_BOOTSTRAP_ADMIN_PASSWORD" "${NAULITE_BOOTSTRAP_ADMIN_PASSWORD}"
fi

if [[ -z "${NAULITE_UI_HOST_PORT:-}" ]]; then
    export NAULITE_UI_HOST_PORT="13000"
    set_env_var "NAULITE_UI_HOST_PORT" "${NAULITE_UI_HOST_PORT}"
fi

NETBIRD_CONFIG="$DOGFOOD/infra/netbird/config.yaml"
if [[ ! -f "$NETBIRD_CONFIG" ]]; then
    export NETBIRD_DOMAIN="${NETBIRD_DOMAIN:-netbird.local}"
    export NETBIRD_HTTP_PROTOCOL="${NETBIRD_HTTP_PROTOCOL:-http}"
    echo "[dev] Initializing NetBird config (NETBIRD_DOMAIN=$NETBIRD_DOMAIN) ..."
    bash "$DOGFOOD/scripts/init-netbird-config.sh"
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
        set_env_var "ADMIN_API_KEY" "${new_key}"
        export ADMIN_API_KEY="$new_key"
        echo "[dev] Wrote ADMIN_API_KEY to .env and restarting ui-backend ..."
        docker compose up -d ui-backend
    else
        echo "[dev] Warning: could not parse API key secret from control plane response." >&2
    fi
else
    echo "[dev] ADMIN_API_KEY already set in .env"
fi

if [[ -z "${NETBIRD_SETUP_KEY:-}" ]]; then
    echo "[dev] NETBIRD_SETUP_KEY is empty - fetching setup key via loopback ..."
    setup_response="$(curl -sf "http://localhost:8080/bootstrap/setup-key")"
    new_setup_key="$(printf '%s' "$setup_response" | node -e "
        const data = JSON.parse(require('fs').readFileSync(0, 'utf8'));
        process.stdout.write(data.setupKey ?? '');
    ")"

    if [[ -n "$new_setup_key" ]]; then
        set_env_var "NETBIRD_SETUP_KEY" "${new_setup_key}"
        export NETBIRD_SETUP_KEY="$new_setup_key"
        echo "[dev] Wrote NETBIRD_SETUP_KEY to .env and restarting agent-1 ..."
        docker compose up -d agent-1
    else
        echo "[dev] Warning: could not parse setup key from control plane response." >&2
    fi
else
    echo "[dev] NETBIRD_SETUP_KEY already set in .env"
fi

login_email="${NAULITE_BOOTSTRAP_ADMIN_USERNAME:-admin@naulite.local}"
login_password="${NAULITE_BOOTSTRAP_ADMIN_PASSWORD:-naulite-dev}"
ui_host_port="${NAULITE_UI_HOST_PORT:-13000}"

echo ""
echo "[dev] Stack is up."
echo "  UI:              http://localhost:${ui_host_port}"
echo "  UI login email:  ${login_email}"
echo "  UI login password: ${login_password}"
echo "  Control plane:   http://localhost:8080"
echo "  Agent health:    http://localhost:9470/health"
echo "  NetBird (host):  ${NETBIRD_PUBLIC_MANAGEMENT_URL}"
echo ""
echo "Useful commands:"
echo "  cd dogfood && docker compose logs -f"
echo "  cd dogfood && docker compose down"
