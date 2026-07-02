#!/usr/bin/env bash
set -euo pipefail
  
AGENT_VERSION="${AGENT_VERSION:-0.1.0}"
INSTALL_DIR="${INSTALL_DIR:-/opt/platform-agent}"
BIN_PATH="${INSTALL_DIR}/bin/platform-agent"
SERVICE_NAME="${SERVICE_NAME:-platform-agent}"
LISTEN_PORT="${LISTEN_PORT:-9470}"
NETBIRD_MANAGEMENT_URL="${NETBIRD_MANAGEMENT_URL:-}"
  
log() {
    printf '[platform-agent] %s\n' "$*"
}
  
require_root() {
    if [[ "${EUID}" -ne 0 ]]; then
        log "run as root or with sudo"
        exit 1
    fi
}
  
detect_os() {
    case "$(uname -s)" in
        Linux) echo "linux" ;;
        Darwin) echo "macos" ;;
        *) echo "unsupported" ;;
    esac
}
  
install_binary() {
    local os
    os="$(detect_os)"
  
    if [[ "${os}" == "unsupported" ]]; then
        log "unsupported operating system"
        exit 1
    fi
  
    mkdir -p "${INSTALL_DIR}/bin"
  
    if command -v zig >/dev/null 2>&1 && [[ -f "$(dirname "$0")/../packages/agent/build.zig" ]]; then
        log "building agent from source with zig"
        pushd "$(dirname "$0")/../packages/agent" >/dev/null
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
Environment=PLATFORM_AGENT_LISTEN_PORT=${LISTEN_PORT}
Environment=NETBIRD_MANAGEMENT_URL=${NETBIRD_MANAGEMENT_URL}
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
    require_root
    log "installing platform-agent ${AGENT_VERSION}"
    install_binary
  
    if command -v systemctl >/dev/null 2>&1; then
        install_systemd_unit
        log "service ${SERVICE_NAME} started on port ${LISTEN_PORT}"
    else
        log "systemd not found; run manually: ${BIN_PATH}"
    fi
}
  
main "$@"
