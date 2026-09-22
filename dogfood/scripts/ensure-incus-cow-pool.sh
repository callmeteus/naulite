#!/usr/bin/env bash
set -euo pipefail

POOL_NAME="${NAULITE_SANDBOX_POOL_NAME:-naulite-sandbox}"
POOL_SIZE_GB="${NAULITE_SANDBOX_POOL_SIZE_GB:-200}"
SPARSE_FILE="${NAULITE_SANDBOX_SPARSE_FILE:-/var/lib/naulite/naulite-sandbox.img}"

if incus storage show "${POOL_NAME}" >/dev/null 2>&1; then
  driver="$(incus storage show "${POOL_NAME}" | awk -F': ' '/^driver:/ { print $2 }')"
  if [[ "${driver}" != "zfs" && "${driver}" != "btrfs" ]]; then
    echo "Incus pool ${POOL_NAME} must use zfs or btrfs (found ${driver})." >&2
    exit 1
  fi
  exit 0
fi

mkdir -p "$(dirname "${SPARSE_FILE}")"
truncate -s "${POOL_SIZE_GB}G" "${SPARSE_FILE}"

if ! command -v zpool >/dev/null 2>&1; then
  echo "zpool is required to create ${POOL_NAME}." >&2
  exit 1
fi

zpool create -f -m none "${POOL_NAME}" "${SPARSE_FILE}"
incus storage create "${POOL_NAME}" zfs source="${POOL_NAME}"

echo "Incus pool ${POOL_NAME} is ready (zfs)."
