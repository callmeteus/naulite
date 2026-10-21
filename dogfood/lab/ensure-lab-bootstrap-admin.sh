#!/usr/bin/env bash
set -euo pipefail

LAB_DIR="$(cd "$(dirname "$0")" && pwd)"
NAULITE_ROOT="${NAULITE_ROOT:-$(cd "${LAB_DIR}/../.." && pwd)}"
NAULITE_URL="${NAULITE_URL:-http://127.0.0.1:18082}"
NAULITE_LAB_DATABASE_PATH="${NAULITE_LAB_DATABASE_PATH:-${NAULITE_ROOT}/data/control-plane-lab182.db}"
NAULITE_BOOTSTRAP_ADMIN_USERNAME="${NAULITE_BOOTSTRAP_ADMIN_USERNAME:-admin@naulite.local}"
NAULITE_BOOTSTRAP_ADMIN_PASSWORD="${NAULITE_BOOTSTRAP_ADMIN_PASSWORD:-naulite-dev}"

login_ok() {
    local code
    code="$(curl -sS -m 5 -o /dev/null -w '%{http_code}' -X POST "${NAULITE_URL}/admin/login" \
        -H 'Content-Type: application/json' \
        -d "{\"email\":\"${NAULITE_BOOTSTRAP_ADMIN_USERNAME}\",\"password\":\"${NAULITE_BOOTSTRAP_ADMIN_PASSWORD}\"}")"
    [ "${code}" = "200" ]
}

bootstrap_admin() {
    curl -fsS -m 10 -X POST "${NAULITE_URL}/admin/bootstrap" \
        -H 'Content-Type: application/json' \
        -d "{\"username\":\"${NAULITE_BOOTSTRAP_ADMIN_USERNAME}\",\"password\":\"${NAULITE_BOOTSTRAP_ADMIN_PASSWORD}\",\"role\":\"admin\"}" \
        >/dev/null
}

if ! curl -fsS -m 3 "${NAULITE_URL}/health" >/dev/null 2>&1; then
    echo "FAIL  control plane not healthy at ${NAULITE_URL}"
    exit 1
fi

if login_ok; then
    echo "PASS  lab admin login ${NAULITE_BOOTSTRAP_ADMIN_USERNAME} (password unchanged)"
    exit 0
fi

if [ ! -f "${NAULITE_LAB_DATABASE_PATH}" ]; then
    echo "FAIL  lab database not found: ${NAULITE_LAB_DATABASE_PATH}"
    exit 1
fi

echo "WARN  resetting admin users in ${NAULITE_LAB_DATABASE_PATH} and bootstrapping defaults"
sqlite3 "${NAULITE_LAB_DATABASE_PATH}" 'DELETE FROM admin_sessions; DELETE FROM admin_users;'

bootstrap_admin

if ! login_ok; then
    echo "FAIL  bootstrap admin login still fails for ${NAULITE_BOOTSTRAP_ADMIN_USERNAME}"
    exit 1
fi

echo "PASS  lab admin login ${NAULITE_BOOTSTRAP_ADMIN_USERNAME} / ${NAULITE_BOOTSTRAP_ADMIN_PASSWORD}"
