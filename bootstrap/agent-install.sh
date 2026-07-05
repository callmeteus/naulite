#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NAULITE_ROOT="${NAULITE_ROOT:-$(cd "${SCRIPT_DIR}/.." && pwd)}"

AGENT_VERSION="${AGENT_VERSION:-zig-0.1.0}"
NETBIRD_VERSION="${NETBIRD_VERSION:-0.35.2}"
INSTALL_DIR="${INSTALL_DIR:-/opt/naulite-agent}"
BIN_PATH="${INSTALL_DIR}/bin/naulite-agent"
SERVICE_NAME="${SERVICE_NAME:-naulite-agent}"
AGENT_PORT="${AGENT_PORT:-9470}"
CONFIG_PATH="${CONFIG_PATH:-/var/lib/naulite/agent.json}"

CP_HOST=""
SETUP_KEY=""
NETBIRD_MANAGEMENT_URL=""
PROVISION_ID=""
NODE_ID=""
LABELS_JSON=""
CAPABILITIES_JSON=""
DRY_RUN=0
INSTALL_NETBIRD=1

log() {
    printf '[naulite-agent] %s\n' "$*"
}

usage() {
    cat <<'EOF'
Usage:
  agent-install.sh [options]

Options:
  --host <url>                     Public control plane base URL
  --setup-key <key>                NetBird setup key from control plane bootstrap
  --netbird-management-url <url>   Self-hosted NetBird management URL (optional; fetched from CP when omitted)
  --management-url <url>           Alias for --netbird-management-url
  --url <url>                      Alias for --netbird-management-url
  --agent-port <port>              Agent HTTP listen port (default: 9470)
  --install-dir <path>             Install directory (default: /opt/naulite-agent)
  --config-path <path>             Agent JSON config path (default: /var/lib/naulite/agent.json)
  --no-install-netbird             Skip NetBird CLI install (enabled by default on Linux)
  --dry-run                        Validate input, fetch bootstrap data, write config only
  -h, --help                       Show this help

When required values are omitted, the installer prompts on an interactive terminal.
EOF
}

can_prompt() {
    [[ -e /dev/tty ]]
}

read_prompt() {
    local prompt="$1"
    local default_value="${2:-}"
    local reply=""

    if [[ -n "${default_value}" ]]; then
        read -rp "${prompt} [${default_value}]: " reply </dev/tty
        printf '%s' "${reply:-${default_value}}"
        return 0
    fi

    read -rp "${prompt}: " reply </dev/tty
    printf '%s' "${reply}"
}

prompt_missing_values() {
    if ! can_prompt; then
        return 0
    fi

    if [[ -z "${CP_HOST}" ]]; then
        CP_HOST="$(read_prompt "Control plane public URL")"
    fi

    if [[ -z "${SETUP_KEY}" ]]; then
        SETUP_KEY="$(read_prompt "NetBird setup key")"
    fi

    if [[ -z "${NETBIRD_MANAGEMENT_URL}" ]]; then
        NETBIRD_MANAGEMENT_URL="$(read_prompt "NetBird management URL (leave empty to fetch from control plane)" "")"
    fi
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
            --netbird-management-url|--management-url|--url)
                NETBIRD_MANAGEMENT_URL="${2:-}"
                shift 2
                ;;
            --agent-port)
                AGENT_PORT="${2:-9470}"
                shift 2
                ;;
            --install-dir)
                INSTALL_DIR="${2:-}"
                BIN_PATH="${INSTALL_DIR}/bin/naulite-agent"
                shift 2
                ;;
            --config-path)
                CONFIG_PATH="${2:-}"
                shift 2
                ;;
            --install-netbird)
                INSTALL_NETBIRD=1
                shift
                ;;
            --no-install-netbird)
                INSTALL_NETBIRD=0
                shift
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
        CP_HOST="${CP_HOST:-${NAULITE_CP_URL:-}}"
        SETUP_KEY="${SETUP_KEY:-${NAULITE_SETUP_KEY:-}}"
    fi

    PROVISION_ID="${PROVISION_ID:-${NAULITE_PROVISION_ID:-}}"
    NODE_ID="${NODE_ID:-${NAULITE_NODE_ID:-}}"
    LABELS_JSON="${LABELS_JSON:-${NAULITE_LABELS:-}}"
    CAPABILITIES_JSON="${CAPABILITIES_JSON:-${NAULITE_CAPABILITIES:-}}"

    prompt_missing_values

    if [[ -z "${CP_HOST}" || -z "${SETUP_KEY}" ]]; then
        log "--host and --setup-key are required when not running on an interactive terminal"
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
        -H "X-Naulite-Setup-Key: ${SETUP_KEY}"
    )

    if [[ -n "${PROVISION_ID}" ]]; then
        curl_args+=(-H "X-Naulite-Provision-Id: ${PROVISION_ID}")
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

install_netbird() {
    if [[ "${INSTALL_NETBIRD}" -ne 1 ]]; then
        return 0
    fi

    if [[ "${DRY_RUN}" -eq 1 ]]; then
        log "dry-run would install netbird ${NETBIRD_VERSION}"
        return 0
    fi

    if command -v netbird >/dev/null 2>&1; then
        log "netbird already installed"
        return 0
    fi

    local os arch
    os="$(detect_os)"
    if [[ "${os}" != "linux" ]]; then
        log "netbird install is supported on Linux only"
        exit 1
    fi

    if ! command -v curl >/dev/null 2>&1; then
        log "curl is required to install netbird"
        exit 1
    fi

    arch="$(uname -m)"
    log "installing netbird ${NETBIRD_VERSION} (${arch})"

    case "${arch}" in
        x86_64|amd64)
            local deb="/tmp/netbird_${NETBIRD_VERSION}_linux_amd64.deb"
            curl -fsSL \
                "https://github.com/netbirdio/netbird/releases/download/v${NETBIRD_VERSION}/netbird_${NETBIRD_VERSION}_linux_amd64.deb" \
                -o "${deb}"
            if command -v apt-get >/dev/null 2>&1; then
                apt-get install -y "${deb}"
            elif command -v dpkg >/dev/null 2>&1; then
                dpkg -i "${deb}" || apt-get install -f -y
            else
                log "apt-get or dpkg is required to install the netbird deb"
                rm -f "${deb}"
                exit 1
            fi
            rm -f "${deb}"
            ;;
        *)
            log "unsupported architecture for pinned netbird deb: ${arch}"
            log "install netbird manually or use an amd64 host"
            exit 1
            ;;
    esac

    if command -v netbird >/dev/null 2>&1; then
        log "netbird installed"
    else
        log "netbird install finished but binary was not found in PATH"
        exit 1
    fi
}

install_binary() {
    local os
    os="$(detect_os)"

    if [[ "${os}" == "unsupported" ]]; then
        log "unsupported operating system"
        exit 1
    fi

    mkdir -p "${INSTALL_DIR}/bin"

    if command -v zig >/dev/null 2>&1 && [[ -f "${NAULITE_ROOT}/packages/agent/build.zig" ]]; then
        log "building agent from source with zig"
        pushd "${NAULITE_ROOT}/packages/agent" >/dev/null
        zig build -Doptimize=ReleaseSafe
        install -m 0755 zig-out/bin/naulite-agent "${BIN_PATH}"
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
Description=Naulite Agent
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
ExecStart=${BIN_PATH}
Environment=NAULITE_AGENT_CONFIG=${CONFIG_PATH}
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
        log "dry-run installing naulite-agent ${AGENT_VERSION}"
        fetch_bootstrap_bundle
        write_agent_config "${os}"
        install_netbird
        log "dry-run complete config=${CONFIG_PATH}"
        exit 0
    fi

    require_root

    local os
    os="$(detect_os)"

    log "installing naulite-agent ${AGENT_VERSION}"
    fetch_bootstrap_bundle
    write_agent_config "${os}"
    install_netbird
    install_binary

    if ! command -v docker >/dev/null 2>&1; then
        log "warning: docker not found; install Docker before scheduling workloads"
    fi

    if command -v systemctl >/dev/null 2>&1; then
        install_systemd_unit
        log "service ${SERVICE_NAME} started; config=${CONFIG_PATH}"
    else
        log "systemd not found; run manually: NAULITE_AGENT_CONFIG=${CONFIG_PATH} ${BIN_PATH}"
    fi
}

main "$@"
