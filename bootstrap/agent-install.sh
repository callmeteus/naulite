#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLATFORM_ROOT="${PLATFORM_ROOT:-$(cd "${SCRIPT_DIR}/.." && pwd)}"

AGENT_VERSION="${AGENT_VERSION:-zig-0.1.0}"
INSTALL_DIR="${INSTALL_DIR:-/opt/platform-agent}"
BIN_PATH="${INSTALL_DIR}/bin/platform-agent"
SERVICE_NAME="${SERVICE_NAME:-platform-agent}"
AGENT_PORT="${AGENT_PORT:-9470}"
CONFIG_PATH="${CONFIG_PATH:-/var/lib/platform/agent.json}"

CP_HOST=""
SETUP_KEY=""
NETBIRD_MANAGEMENT_URL=""
PROVISION_ID=""
NODE_ID=""
LABELS_JSON=""
CAPABILITIES_JSON=""
DRY_RUN=0

log() {
    printf '[platform-agent] %s\n' "$*"
}

usage() {
    cat <<'EOF'
Usage:
  agent-install.sh --host <control-plane-url> --setup-key <netbird-setup-key> [options]

Options:
  --host <url>                     Public control plane base URL (required)
  --setup-key <key>                NetBird setup key from control plane bootstrap (required)
  --netbird-management-url <url>   Self-hosted NetBird management URL (optional; fetched from CP when omitted)
  --agent-port <port>              Agent HTTP listen port (default: 9470)
  --install-dir <path>             Install directory (default: /opt/platform-agent)
  --config-path <path>             Agent JSON config path (default: /var/lib/platform/agent.json)
  --dry-run                        Validate input, fetch bootstrap data, write config only
  -h, --help                       Show this help
EOF
}

require_root() {
    if [[ "${EUID}" -ne 0 ]]; then
        log "run as root or with sudo"
        exit 1
    fi
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --host)
                CP_HOST="${2:-}"
                shift 2
                ;;
            --setup-key)
                SETUP_KEY="${2:-}"
                shift 2
                ;;
            --netbird-management-url)
                NETBIRD_MANAGEMENT_URL="${2:-}"
                shift 2
                ;;
            --agent-port)
                AGENT_PORT="${2:-9470}"
                shift 2
                ;;
            --install-dir)
                INSTALL_DIR="${2:-}"
                BIN_PATH="${INSTALL_DIR}/bin/platform-agent"
                shift 2
                ;;
            --config-path)
                CONFIG_PATH="${2:-}"
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

    if [[ -z "${CP_HOST}" || -z "${SETUP_KEY}" ]]; then
        CP_HOST="${CP_HOST:-${PLATFORM_CP_URL:-}}"
        SETUP_KEY="${SETUP_KEY:-${PLATFORM_SETUP_KEY:-}}"
    fi

    PROVISION_ID="${PROVISION_ID:-${PLATFORM_PROVISION_ID:-}}"
    NODE_ID="${NODE_ID:-${PLATFORM_NODE_ID:-}}"
    LABELS_JSON="${LABELS_JSON:-${PLATFORM_LABELS:-}}"
    CAPABILITIES_JSON="${CAPABILITIES_JSON:-${PLATFORM_CAPABILITIES:-}}"

    if [[ -z "${CP_HOST}" || -z "${SETUP_KEY}" ]]; then
        log "--host and --setup-key are required"
        usage
        exit 1
    fi

    CP_HOST="${CP_HOST%/}"
}

detect_os() {
    case "$(uname -s)" in
        Linux) echo "linux" ;;
        Darwin) echo "macos" ;;
        *) echo "unsupported" ;;
    esac
}

default_docker_socket() {
    local os="$1"
    if [[ "${os}" == "linux" || "${os}" == "macos" ]]; then
        echo "/var/run/docker.sock"
    else
        echo "/var/run/docker.sock"
    fi
}

fetch_bootstrap_bundle() {
    if [[ -n "${NETBIRD_MANAGEMENT_URL}" ]]; then
        return 0
    fi

    if ! command -v curl >/dev/null 2>&1; then
        log "curl is required to fetch bootstrap settings"
        exit 1
    fi

    log "fetching bootstrap settings from ${CP_HOST}/bootstrap/agent"
    local curl_args=(
        -sf
        -H "X-Platform-Setup-Key: ${SETUP_KEY}"
    )

    if [[ -n "${PROVISION_ID}" ]]; then
        curl_args+=(-H "X-Platform-Provision-Id: ${PROVISION_ID}")
    fi

    response="$(curl "${curl_args[@]}" "${CP_HOST}/bootstrap/agent")"

    if command -v node >/dev/null 2>&1; then
        NETBIRD_MANAGEMENT_URL="$(printf '%s' "${response}" | node -e "
            const data = JSON.parse(require('fs').readFileSync(0, 'utf8'));
            process.stdout.write(data.netbirdManagementUrl ?? '');
        ")"
    else
        log "node is required to parse bootstrap response"
        exit 1
    fi

    if [[ -z "${NETBIRD_MANAGEMENT_URL}" ]]; then
        log "control plane did not return netbirdManagementUrl; pass --netbird-management-url"
        exit 1
    fi
}

write_agent_config() {
    local os="$1"
    local hostname
    local docker_socket
    local config_dir
    local agent_url

    hostname="$(hostname -s 2>/dev/null || hostname)"
    docker_socket="$(default_docker_socket "${os}")"
    config_dir="$(dirname "${CONFIG_PATH}")"
    agent_url="http://${hostname}:${AGENT_PORT}"

    mkdir -p "${config_dir}"

    cat >"${CONFIG_PATH}" <<EOF
{
  "cpUrl": "${CP_HOST}",
  "hostname": "${hostname}",
  "agentUrl": "${agent_url}",
  "agentVersion": "${AGENT_VERSION}",
  "agentPort": ${AGENT_PORT},
  "dockerSocket": "${docker_socket}",
  "netbirdManagementUrl": "${NETBIRD_MANAGEMENT_URL}",
  "netbirdSetupKey": "${SETUP_KEY}"$( [[ -n "${PROVISION_ID}" ]] && printf ',
  "provisionId": "%s"' "${PROVISION_ID}" )$( [[ -n "${NODE_ID}" ]] && printf ',
  "nodeId": "%s"' "${NODE_ID}" )$( [[ -n "${LABELS_JSON}" ]] && printf ',
  "labels": %s' "${LABELS_JSON}" )$( [[ -n "${CAPABILITIES_JSON}" ]] && printf ',
  "capabilities": %s' "${CAPABILITIES_JSON}" )
}
EOF

  chmod 600 "${CONFIG_PATH}"
  log "wrote agent config path=${CONFIG_PATH}"
}

install_binary() {
    local os
    os="$(detect_os)"

    if [[ "${os}" == "unsupported" ]]; then
        log "unsupported operating system"
        exit 1
    fi

    mkdir -p "${INSTALL_DIR}/bin"

    if command -v zig >/dev/null 2>&1 && [[ -f "${PLATFORM_ROOT}/packages/agent/build.zig" ]]; then
        log "building agent from source with zig"
        pushd "${PLATFORM_ROOT}/packages/agent" >/dev/null
        zig build -Doptimize=ReleaseSafe
        install -m 0755 zig-out/bin/platform-agent "${BIN_PATH}"
        popd >/dev/null
    else
        log "zig not found; place a prebuilt binary at ${BIN_PATH}"
        if [[ ! -x "${BIN_PATH}" ]]; then
            log "binary missing at ${BIN_PATH}"
            exit 1
        fi
    fi
}

install_systemd_unit() {
    cat >/etc/systemd/system/${SERVICE_NAME}.service <<EOF
[Unit]
Description=Platform Agent
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
ExecStart=${BIN_PATH}
Environment=PLATFORM_AGENT_CONFIG=${CONFIG_PATH}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable "${SERVICE_NAME}"
    systemctl restart "${SERVICE_NAME}"
}

main() {
    parse_args "$@"

    if [[ "${DRY_RUN}" -eq 1 ]]; then
        local os
        os="$(detect_os)"
        log "dry-run installing platform-agent ${AGENT_VERSION}"
        fetch_bootstrap_bundle
        write_agent_config "${os}"
        log "dry-run complete config=${CONFIG_PATH}"
        exit 0
    fi

    require_root

    local os
    os="$(detect_os)"

    log "installing platform-agent ${AGENT_VERSION}"
    fetch_bootstrap_bundle
    write_agent_config "${os}"
    install_binary

    if ! command -v docker >/dev/null 2>&1; then
        log "warning: docker not found; install Docker before scheduling workloads"
    fi

    if command -v systemctl >/dev/null 2>&1; then
        install_systemd_unit
        log "service ${SERVICE_NAME} started; config=${CONFIG_PATH}"
    else
        log "systemd not found; run manually: PLATFORM_AGENT_CONFIG=${CONFIG_PATH} ${BIN_PATH}"
    fi
}

main "$@"
