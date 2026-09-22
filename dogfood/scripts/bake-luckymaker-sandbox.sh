#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROFILE="${ROOT_DIR}/dogfood/incus/naulite-sandbox.yaml"
PARENT="${NAULITE_SANDBOX_PARENT:-luckymaker-workspace}"
MODULES_VOLUME="${NAULITE_SANDBOX_MODULES_VOLUME:-luckymaker-workspace-modules}"
NVM_VERSION="25.2.1"
YARN_VERSION="1.19.0"

PARENT_TOOLCHAIN='
export NVM_DIR="${HOME}/.nvm"
[ -s "${NVM_DIR}/nvm.sh" ] && . "${NVM_DIR}/nvm.sh"
nvm use default >/dev/null 2>&1 || true
'

"${ROOT_DIR}/dogfood/scripts/ensure-incus-cow-pool.sh"

incus profile create naulite-sandbox 2>/dev/null || true
incus profile edit naulite-sandbox < "${PROFILE}"

if ! incus info "${PARENT}" >/dev/null 2>&1; then
  incus launch ubuntu:24.04 "${PARENT}" -p naulite-sandbox -c boot.autostart=false
fi

incus exec "${PARENT}" -- bash -lc "apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y git build-essential python3 tmux curl ca-certificates gnupg"

if ! incus info "${MODULES_VOLUME}" >/dev/null 2>&1; then
  incus launch ubuntu:24.04 "${MODULES_VOLUME}" -p naulite-sandbox -c boot.autostart=false
  incus exec "${MODULES_VOLUME}" -- bash -lc "mkdir -p /modules && chown -R ubuntu:ubuntu /modules || true"
  incus stop "${MODULES_VOLUME}" --force
  incus snapshot create "${MODULES_VOLUME}" base
fi

incus exec "${PARENT}" -- bash -lc "command -v docker >/dev/null 2>&1 || curl -fsSL https://get.docker.com | sh"

incus exec "${PARENT}" -- bash -lc "export NVM_DIR=/home/ubuntu/.nvm; curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash; . \"\${NVM_DIR}/nvm.sh\"; nvm install ${NVM_VERSION}; nvm alias default ${NVM_VERSION}; npm install -g yarn@${YARN_VERSION} nayr verc @luckymaker/cli"

incus exec "${PARENT}" -- bash -lc "${PARENT_TOOLCHAIN} mkdir -p /workspace && cd /workspace && if [ ! -d .git ]; then git clone git@github.com:even7hq/luckymaker-workspace.git .; fi && lm git pull || true"

incus start "${MODULES_VOLUME}" 2>/dev/null || true
incus exec "${MODULES_VOLUME}" -- bash -lc "apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y git build-essential curl ca-certificates || true"
incus exec "${MODULES_VOLUME}" -- bash -lc "export NVM_DIR=/home/ubuntu/.nvm; curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash; . \"\${NVM_DIR}/nvm.sh\"; nvm install ${NVM_VERSION}; npm install -g yarn@${YARN_VERSION} nayr verc @luckymaker/cli; mkdir -p /modules/workspace && cd /modules/workspace && if [ ! -d .git ]; then git clone git@github.com:even7hq/luckymaker-workspace.git .; fi && lm git pull || true && yarn install || true"
incus stop "${MODULES_VOLUME}" --force
if incus info "${MODULES_VOLUME}" | grep -q "base"; then
  incus snapshot delete "${MODULES_VOLUME}" base
fi
incus snapshot create "${MODULES_VOLUME}" base

incus exec "${PARENT}" -- docker run --rm hello-world

if incus info "${PARENT}" | grep -q "base"; then
  incus snapshot delete "${PARENT}" base
fi
incus snapshot create "${PARENT}" base

echo "Bake finished for ${PARENT} (modules volume ${MODULES_VOLUME})."
echo "Register template: POST /sandboxes with id=${PARENT}, nodeId=<sandbox-node>, incusName=${PARENT}, modulesVolume=${MODULES_VOLUME}"
