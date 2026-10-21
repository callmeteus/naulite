#!/usr/bin/env bash
set -euo pipefail

LAB_DIR="$(cd "$(dirname "$0")" && pwd)"
NAULITE_ROOT="${NAULITE_ROOT:-$(cd "${LAB_DIR}/../.." && pwd)}"
NAULITE_URL="${NAULITE_URL:-http://127.0.0.1:18082}"
NAULITE_LAB_DATABASE_PATH="${NAULITE_LAB_DATABASE_PATH:-${NAULITE_ROOT}/data/control-plane-lab182.db}"

if curl -fsS -m 3 "${NAULITE_URL}/health" >/dev/null 2>&1; then
    ids="$(curl -fsS -H "Authorization: Bearer ${NAULITE_ADMIN_TOKEN:-naulite-dev-agent}" \
        "${NAULITE_URL}/nodes/provisions?limit=200" | jq -r '.items[] | select(.status == "bootstrapping" or .status == "failed" or .status == "pending" or .status == "launching") | .id')"

    if [ -n "${ids}" ]; then
        while read -r id; do
            if [ -z "${id}" ]; then
                continue
            fi

            curl -fsS -m 30 -X DELETE \
                -H "Authorization: Bearer ${NAULITE_ADMIN_TOKEN:-naulite-dev-agent}" \
                "${NAULITE_URL}/nodes/provisions/${id}" >/dev/null || true
        done <<< "${ids}"
    fi

    remaining="$(curl -fsS -H "Authorization: Bearer ${NAULITE_ADMIN_TOKEN:-naulite-dev-agent}" \
        "${NAULITE_URL}/nodes/provisions?limit=1" | jq -r '.total')"
    echo "PASS  provisioning history via API (remaining total=${remaining})"
    exit 0
fi

if [ ! -f "${NAULITE_LAB_DATABASE_PATH}" ]; then
    echo "FAIL  control plane down and lab db missing: ${NAULITE_LAB_DATABASE_PATH}"
    exit 1
fi

deleted="$(sqlite3 "${NAULITE_LAB_DATABASE_PATH}" "DELETE FROM node_provisions WHERE status IN ('bootstrapping','failed','pending','launching'); SELECT changes();")"
echo "PASS  removed ${deleted} stale node_provisions rows from ${NAULITE_LAB_DATABASE_PATH}"
