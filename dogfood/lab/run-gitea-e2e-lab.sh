#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
NAULITE_URL="${NAULITE_URL:-http://127.0.0.1:18082}"
NAULITE_ADMIN_TOKEN="${NAULITE_ADMIN_TOKEN:-naulite-dev-agent}"
LAB_GIT="${ROOT}/luckymaker-gitops"
COMMIT_SHA="${COMMIT_SHA:-gitea-$(date +%s)}"
LAB_TARGET_ENV="${LAB_TARGET_ENV:-${ROOT}/.lab-target.env}"

if [ -f "${LAB_TARGET_ENV}" ]; then
    # shellcheck source=/dev/null
    source "${LAB_TARGET_ENV}"
fi

if [ -z "${NAULITE_CP_HEALTH_URL:-}" ]; then
    CP_HEALTH_PORT="${NAULITE_CP_HEALTH_PORT:-$(echo "${NAULITE_URL}" | sed -n 's/.*:\([0-9][0-9]*\).*/\1/p')}"
    CP_HEALTH_PORT="${CP_HEALTH_PORT:-18082}"
    export NAULITE_CP_HEALTH_URL="http://host.docker.internal:${CP_HEALTH_PORT}/health"
fi

if [ -z "${NAULITE_HOOK_URL:-}" ]; then
    HOOK_QUERY="manifestPath=luckymaker-ci.lab.naulite.yml"
    if [ -n "${TARGET:-}" ]; then
        HOOK_QUERY="${HOOK_QUERY}&target=${TARGET}"
    fi
    if [ -n "${NAULITE_CP_HEALTH_URL:-}" ]; then
        HOOK_QUERY="${HOOK_QUERY}&nauliteCpHealthUrl=${NAULITE_CP_HEALTH_URL}"
    fi
    CP_WEBHOOK_BASE="${NAULITE_URL}"
    CP_WEBHOOK_BASE="${CP_WEBHOOK_BASE//127.0.0.1/host.docker.internal}"
    CP_WEBHOOK_BASE="${CP_WEBHOOK_BASE//localhost/host.docker.internal}"
    export NAULITE_HOOK_URL="${CP_WEBHOOK_BASE}/gitops/webhook/gitea?${HOOK_QUERY}"
fi

export NAULITE_URL
bash "${ROOT}/setup-gitea-lab.sh"

PUSHED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "Empty commit to trigger Gitea webhook"
git -C "${LAB_GIT}" commit --allow-empty -m "lab webhook ${COMMIT_SHA}" 2>/dev/null || true
COMMIT_SHA="$(git -C "${LAB_GIT}" rev-parse HEAD)"
export COMMIT_SHA BRANCH="${BRANCH:-master}"
"${ROOT}/prove-s3-artifact.sh"
git -C "${LAB_GIT}" push gitea master

echo "Waiting for pipeline run (coalesce up to 10s)..."
sleep 12

RUN_ID=""
for _ in $(seq 1 30); do
    RUN_ID=$(curl -fsS -H "Authorization: Bearer ${NAULITE_ADMIN_TOKEN}" \
        "${NAULITE_URL}/runs?limit=25" | jq -r --arg since "${PUSHED_AT}" \
        '[.items[] | select(.id | startswith("luckymaker-ci-lab")) | select(.createdAt >= $since)] | sort_by(.createdAt) | reverse | .[0].id // empty')

    if [ -n "${RUN_ID}" ]; then
        break
    fi

    sleep 2
done

if [ -z "${RUN_ID}" ]; then
    echo "No pipeline run found; check CP logs and Gitea hook delivery."
    exit 1
fi

for _ in $(seq 1 45); do
    STATUS=$(curl -fsS -H "Authorization: Bearer ${NAULITE_ADMIN_TOKEN}" \
        "${NAULITE_URL}/runs/${RUN_ID}" | jq -r '.status')
    echo "run ${RUN_ID} status=${STATUS}"
    if [ "${STATUS}" = "succeeded" ]; then
        curl -fsS -H "Authorization: Bearer ${NAULITE_ADMIN_TOKEN}" \
            "${NAULITE_URL}/runs/${RUN_ID}" | jq '{status, commitSha, events: [.events[].message] | .[-6:]}'
        exit 0
    fi

    if [ "${STATUS}" = "failed" ]; then
        curl -fsS -H "Authorization: Bearer ${NAULITE_ADMIN_TOKEN}" \
            "${NAULITE_URL}/runs/${RUN_ID}" | jq '{status, commitSha, events: [.events[].message] | .[-6:]}'
        exit 1
    fi

    sleep 2
done

echo "Timed out waiting for run ${RUN_ID}"
exit 1
