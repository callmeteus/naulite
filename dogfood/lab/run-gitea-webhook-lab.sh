#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/naulite-lm-lab.sh
source "${ROOT}/lib/naulite-lm-lab.sh"
LM_LAB="$(naulite_lm_lab_dir)"
GITEA_URL="${GITEA_URL:-http://127.0.0.1:3001}"
GITEA_USER="${GITEA_USER:-even7}"
REPO_NAME="${GITEA_REPO:-luckymaker}"
GITOPS_DIR="${NAULITE_DOGFOOD_GITOPS_DIR:-${LM_LAB}/luckymaker-gitops}"
NAULITE_URL="${NAULITE_URL:-http://127.0.0.1:18080}"
NAULITE_ADMIN_TOKEN="${NAULITE_ADMIN_TOKEN:-naulite-dev-agent}"
COMMIT_SHA="${COMMIT_SHA:-$(git -C "${GITOPS_DIR}" rev-parse HEAD 2>/dev/null || echo "lab-$(date +%s)")}"
BRANCH="${BRANCH:-master}"
LAB_TARGET_ENV="${LAB_TARGET_ENV:-${LM_LAB}/.lab-target.env}"

if [ -f "${LAB_TARGET_ENV}" ]; then
    # shellcheck source=/dev/null
    source "${LAB_TARGET_ENV}"
fi

if [ -z "${NAULITE_CP_HEALTH_URL:-}" ]; then
    CP_HEALTH_PORT="${NAULITE_CP_HEALTH_PORT:-$(echo "${NAULITE_URL}" | sed -n 's/.*:\([0-9][0-9]*\).*/\1/p')}"
    CP_HEALTH_PORT="${CP_HEALTH_PORT:-18080}"
    export NAULITE_CP_HEALTH_URL="http://host.docker.internal:${CP_HEALTH_PORT}/health"
fi

export COMMIT_SHA
"${ROOT}/prove-s3-artifact.sh"

TARGET="${TARGET:-dev-local}"
WEBHOOK_QUERY="manifestPath=${NAULITE_CI_MANIFEST:-sample-ci.lab.naulite.yml}"

if [ -n "${TARGET}" ] && [ "${TARGET}" != "dev-local" ]; then
    WEBHOOK_QUERY="${WEBHOOK_QUERY}&target=${TARGET}"
fi

if [ -n "${NAULITE_CP_HEALTH_URL:-}" ]; then
    WEBHOOK_QUERY="${WEBHOOK_QUERY}&nauliteCpHealthUrl=${NAULITE_CP_HEALTH_URL}"
fi

echo "Simulating Gitea push webhook to ${NAULITE_URL}/gitops/webhook/gitea (${WEBHOOK_QUERY})"
curl -fsS -X POST "${NAULITE_URL}/gitops/webhook/gitea?${WEBHOOK_QUERY}" \
    -H "Content-Type: application/json" \
    -H "X-Gitea-Delivery: lab-gitea-${COMMIT_SHA}" \
    -d "$(jq -n \
        --arg ref "refs/heads/${BRANCH}" \
        --arg after "$COMMIT_SHA" \
        --arg cloneUrl "${LAB_REPO_URL:-file://${GITOPS_DIR}}" \
        --arg fullName "${GITEA_USER}/${REPO_NAME}" \
        '{
            ref: $ref,
            after: $after,
            repository: {
                clone_url: $cloneUrl,
                full_name: $fullName
            }
        }')"
