#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLATFORM_ROOT="${PLATFORM_ROOT:-$(cd "${SCRIPT_DIR}/.." && pwd)}"

CP_HOST=""
NETBIRD_DOMAIN="${NETBIRD_DOMAIN:-netbird.local}"
NETBIRD_HTTP_PROTOCOL="${NETBIRD_HTTP_PROTOCOL:-http}"
NETBIRD_PUBLIC_MANAGEMENT_URL=""
NETBIRD_SERVER_PORT="${NETBIRD_SERVER_PORT:-9081}"
DRY_RUN=0

log() {
    printf '[platform-control-plane] %s\n' "$*"
}

usage() {
    cat <<'EOF'
Usage:
  control-plane-install.sh --host <public-control-plane-url> [options]

Options:
  --host <url>                         Public control plane URL shown to agents (required)
  --netbird-domain <domain>            NetBird domain for local dogfood (default: netbird.local)
  --netbird-http-protocol <protocol>   http or https for NetBird dashboard (default: http)
  --netbird-public-management-url <url> Public NetBird management URL for enrolling agents
  --netbird-server-port <port>         Host port for NetBird management API (default: 9081)
  --dry-run                            Validate input and write .env only
  -h, --help                           Show this help
EOF
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --host)
                CP_HOST="${2:-}"
                shift 2
                ;;
            --netbird-domain)
                NETBIRD_DOMAIN="${2:-}"
                shift 2
                ;;
            --netbird-http-protocol)
                NETBIRD_HTTP_PROTOCOL="${2:-}"
                shift 2
                ;;
            --netbird-public-management-url)
                NETBIRD_PUBLIC_MANAGEMENT_URL="${2:-}"
                shift 2
                ;;
            --netbird-server-port)
                NETBIRD_SERVER_PORT="${2:-}"
                shift 2
                ;;
            --dry-run)
                DRY_RUN=1
                shift
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            *)
                log "unknown argument: $1"
                usage
                exit 1
                ;;
        esac
    done

    if [[ -z "${CP_HOST}" ]]; then
        log "--host is required"
        usage
        exit 1
    fi

    CP_HOST="${CP_HOST%/}"
}

require_docker() {
    if ! command -v docker >/dev/null 2>&1; then
        log "docker is required"
        exit 1
    fi

    if ! docker compose version >/dev/null 2>&1; then
        log "docker compose plugin is required"
        exit 1
    fi
}

set_env_var() {
    local key="$1"
    local value="$2"
    local file="${PLATFORM_ROOT}/.env"

    if grep -q "^${key}=" "${file}" 2>/dev/null; then
        sed -i.bak "s|^${key}=.*|${key}=${value}|" "${file}"
        rm -f "${file}.bak"
    else
        printf '%s=%s\n' "${key}" "${value}" >> "${file}"
    fi
}

prepare_env() {
    cd "${PLATFORM_ROOT}"

    if [[ ! -f .env ]]; then
        cp .env.example .env
        log "created .env from .env.example"
    fi

    set_env_var "PLATFORM_PUBLIC_URL" "${CP_HOST}"

    if [[ -n "${NETBIRD_PUBLIC_MANAGEMENT_URL}" ]]; then
        set_env_var "NETBIRD_PUBLIC_MANAGEMENT_URL" "${NETBIRD_PUBLIC_MANAGEMENT_URL}"
    fi

    set_env_var "NETBIRD_DOMAIN" "${NETBIRD_DOMAIN}"
    set_env_var "NETBIRD_HTTP_PROTOCOL" "${NETBIRD_HTTP_PROTOCOL}"
    set_env_var "NETBIRD_SERVER_PORT" "${NETBIRD_SERVER_PORT}"

    # shellcheck disable=SC1091
    set -a
    source .env
    set +a
}

init_netbird() {
    local netbird_config="${PLATFORM_ROOT}/infra/netbird/config.yaml"

    if [[ ! -f "${netbird_config}" ]]; then
        log "initializing NetBird config domain=${NETBIRD_DOMAIN}"
        export NETBIRD_DOMAIN NETBIRD_HTTP_PROTOCOL NETBIRD_SERVER_PORT
        bash "${PLATFORM_ROOT}/scripts/init-netbird-config.sh"
    else
        log "NetBird config already present at infra/netbird/config.yaml"
    fi
}

start_stack() {
    log "starting docker compose stack"
    docker compose up -d --build
}

wait_for_health() {
    log "waiting for control plane health on http://localhost:8080/health"
    local ready=0

    for _ in $(seq 1 90); do
        if curl -sf "http://localhost:8080/health" >/dev/null 2>&1; then
            ready=1
            break
        fi
        sleep 2
    done

    if [[ "${ready}" -ne 1 ]]; then
        log "control plane did not become healthy in time"
        exit 1
    fi
}

ensure_admin_key() {
    cd "${PLATFORM_ROOT}"

    # shellcheck disable=SC1091
    set -a
    source .env
    set +a

    if [[ -n "${ADMIN_API_KEY:-}" ]]; then
        log "ADMIN_API_KEY already set in .env"
        return 0
    fi

    log "creating dev ADMIN_API_KEY via loopback"
    local key_response
    key_response="$(curl -sf -X POST "http://localhost:8080/api-keys" \
        -H "Content-Type: application/json" \
        -d '{"name":"bootstrap-admin"}')"

    local new_key
    new_key="$(printf '%s' "${key_response}" | node -e "
        const data = JSON.parse(require('fs').readFileSync(0, 'utf8'));
        process.stdout.write(data.secret ?? '');
    ")"

    if [[ -n "${new_key}" ]]; then
        set_env_var "ADMIN_API_KEY" "${new_key}"
        docker compose up -d ui-backend
        log "wrote ADMIN_API_KEY to .env"
    else
        log "warning: could not parse API key secret from control plane response"
    fi
}

fetch_setup_key() {
    local response
    response="$(curl -sf "http://localhost:8080/bootstrap/setup-key")"

    if command -v node >/dev/null 2>&1; then
        printf '%s' "${response}" | node -e "
            const data = JSON.parse(require('fs').readFileSync(0, 'utf8'));
            process.stdout.write(data.setupKey ?? '');
        "
    else
        log "node is required to parse setup key response"
        exit 1
    fi
}

print_next_steps() {
    local setup_key="$1"

    cat <<EOF

Control plane is ready.

  UI:            http://localhost:3000
  Control plane: http://localhost:8080
  Public URL:    ${CP_HOST}

Install an agent on another machine:

  curl -fsSL <repo>/bootstrap/agent-install.sh | sudo bash -s -- \\
    --host ${CP_HOST} \\
    --setup-key ${setup_key}

Only POST /nodes/register and GET /bootstrap/agent need public internet exposure
when the control plane API is otherwise private.

EOF
}

main() {
    parse_args "$@"

    if [[ "${DRY_RUN}" -eq 1 ]]; then
        prepare_env
        log "dry-run complete env=${PLATFORM_ROOT}/.env"
        exit 0
    fi

    require_docker
    prepare_env
    init_netbird
    start_stack
    wait_for_health
    ensure_admin_key

    local setup_key
    setup_key="$(fetch_setup_key)"

    if [[ -z "${setup_key}" ]]; then
        log "failed to obtain setup key from /bootstrap/setup-key"
        exit 1
    fi

    print_next_steps "${setup_key}"
}

main "$@"
